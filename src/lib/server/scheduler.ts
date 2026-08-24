import cron from 'node-cron';
import { db } from './db';
import { settings, integrations } from './schema';
import { sendScheduledDiscordReport } from './discord';
import { refreshAllSocialStats } from './social-stats';
import { recoverStaleJobs, processQueue } from './render-queue';
import { runReleaseTick, checkPublishCoverage } from './clip-queue';
import { env } from '$env/dynamic/private';
import { desc } from 'drizzle-orm';

let isInitialized = false;

/**
 * Initialize scheduled tasks
 * Runs every hour to check if any tasks are due
 */
export function initScheduler(): void {
  if (isInitialized) return;
  isInitialized = true;

  console.log('[Scheduler] Initializing...');

  // A render in flight when the process died can never finish, so clear those
  // before picking up anything still queued.
  void recoverStaleJobs()
    .then(() => processQueue())
    .catch((e) => console.error('[Scheduler] Render queue startup failed:', e));

  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Running hourly check...');
    await runScheduledTasks();
  });

  // Its own tick: an alarm on an hourly schedule can sit unraised for 59
  // minutes, and the whole point is noticing a release went nowhere.
  cron.schedule('*/15 * * * *', async () => {
    const origin = env.BETTER_AUTH_BASE_URL || env.ORIGIN;
    if (!origin) return;
    await checkPublishCoverage(origin).catch((e) =>
      console.error('[Scheduler] Coverage check failed:', e)
    );
  });

  console.log('[Scheduler] Started - hourly tasks, coverage check every 15m');
}

async function runScheduledTasks(): Promise<void> {
  try {
    // Get settings
    const [settingsData] = await db.select().from(settings).limit(1);
    if (!settingsData) return;

    // Task 1: Discord scheduled report
    if (settingsData.discordEnabled && settingsData.discordWebhookUrl) {
      const shouldSend = checkDiscordSchedule(settingsData);
      if (shouldSend) {
        console.log('[Scheduler] Sending Discord report...');
        const result = await sendScheduledDiscordReport();
        if (result.success) {
          console.log('[Scheduler] Discord report sent successfully');
        } else {
          console.error('[Scheduler] Discord report failed:', result.error);
        }
      }
    }

    // Task 1b: Release the next queued clip if a slot is due.
    // The webhook payload carries absolute URLs, so it needs the public origin —
    // there's no request to derive it from inside a cron tick.
    const origin = env.BETTER_AUTH_BASE_URL || env.ORIGIN;
    if (origin) {
      try {
        await runReleaseTick(origin);
      } catch (e) {
        console.error('[Scheduler] Clip release failed:', e);
      }
    }

    // Task 2: Refresh social stats (once per day, at 6 AM)
    const now = new Date();
    if (now.getHours() === 6) {
      // Check last sync from integrations table
      const [latestIntegration] = await db
        .select({ lastSync: integrations.lastSync })
        .from(integrations)
        .orderBy(desc(integrations.lastSync))
        .limit(1);

      const lastSync = latestIntegration?.lastSync;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (!lastSync || new Date(lastSync) < oneDayAgo) {
        console.log('[Scheduler] Refreshing social stats...');
        try {
          await refreshAllSocialStats();
          console.log('[Scheduler] Social stats refreshed');
        } catch (e) {
          console.error('[Scheduler] Failed to refresh social stats:', e);
        }
      }
    }
  } catch (e) {
    console.error('[Scheduler] Error running tasks:', e);
  }
}

function checkDiscordSchedule(profileData: {
  discordSchedule: string | null;
  discordScheduleDay: number | null;
  discordScheduleTime: string | null;
  discordLastSent: Date | null;
}): boolean {
  const now = new Date();
  const schedule = profileData.discordSchedule ?? 'weekly';
  const scheduleDay = profileData.discordScheduleDay ?? 1;
  const scheduleTime = profileData.discordScheduleTime ?? '09:00';
  const lastSent = profileData.discordLastSent;

  // Parse scheduled time
  const [hour] = scheduleTime.split(':').map(Number);
  const currentHour = now.getHours();

  // Check if we're at the scheduled hour
  if (currentHour !== hour) {
    return false;
  }

  // Check if already sent today
  if (lastSent) {
    const lastSentDate = new Date(lastSent);
    if (
      lastSentDate.getFullYear() === now.getFullYear() &&
      lastSentDate.getMonth() === now.getMonth() &&
      lastSentDate.getDate() === now.getDate()
    ) {
      return false;
    }
  }

  // Check schedule type
  switch (schedule) {
    case 'daily':
      return true;

    case 'weekly':
      // scheduleDay: 0 = Sunday, 1 = Monday, etc.
      return now.getDay() === scheduleDay;

    case 'monthly':
      // scheduleDay: 1-28
      return now.getDate() === scheduleDay;

    default:
      return false;
  }
}
