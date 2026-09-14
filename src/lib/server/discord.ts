import type { OverviewStats, PageViewStats, LinkClickStats } from './analytics';
import type { SocialStats } from './social-stats';
import { db } from './db';
import { getDiscordSettings, updateDiscordSettings } from './settings';
import type { DiscordSettings } from './schema';
import { settings } from './schema';
import { eq, sql } from 'drizzle-orm';

export interface DiscordReportData {
  title: string;
  overview: OverviewStats;
  pageViews: PageViewStats;
  linkClicks: LinkClickStats;
  socialStats?: SocialStats;
  isTest?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

/**
 * Stop Discord making a preview out of every link in a piece of text.
 *
 * It unfurls each one it finds, and a clip's description routinely carries a
 * ticket link or two — which would arrive as a stack of link cards under the
 * post, pushing the clip itself out of sight. Angle brackets are how Discord is
 * told not to, and they don't show.
 *
 * Only bare links. One already inside brackets, or written as the target of a
 * markdown link, is left as it is.
 */
export function quietLinks(text: string): string {
  return text.replace(/(?<![<(])\bhttps?:\/\/[^\s<>()]+/g, (url) => `<${url}>`);
}

// Format number with K/M suffixes
function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export function buildStatsEmbed(data: DiscordReportData): DiscordEmbed {
  const { overview, pageViews, linkClicks, socialStats, isTest } = data;

  const fields: DiscordEmbed['fields'] = [];

  // Overview stats
  fields.push({
    name: '📊 Page Views',
    value: `**${formatNumber(overview.monthViews)}** (30 days)\n${formatNumber(overview.weekViews)} this week`,
    inline: true
  });

  fields.push({
    name: '🔗 Link Clicks',
    value: `**${formatNumber(overview.monthClicks)}** (30 days)\n${formatNumber(overview.weekClicks)} this week`,
    inline: true
  });

  // Top referrer
  if (overview.topReferrer) {
    fields.push({
      name: '🌐 Top Referrer',
      value: overview.topReferrer,
      inline: true
    });
  }

  // Top clicked link
  if (overview.topLink) {
    fields.push({
      name: '⭐ Most Clicked',
      value: `${overview.topLink.label || overview.topLink.platform} (${overview.topLink.clicks} clicks)`,
      inline: true
    });
  }

  // Top referrers breakdown
  if (pageViews.viewsByReferrer.length > 0) {
    const topRefs = pageViews.viewsByReferrer
      .slice(0, 5)
      .map((r) => `• ${r.referrer}: ${r.count}`)
      .join('\n');
    fields.push({
      name: '📍 Top Sources',
      value: topRefs,
      inline: false
    });
  }

  // Top countries
  if (pageViews.viewsByCountry.length > 0) {
    const topCountries = pageViews.viewsByCountry
      .slice(0, 5)
      .map((c) => `• ${c.country}: ${c.count}`)
      .join('\n');
    fields.push({
      name: '🌍 Top Countries',
      value: topCountries,
      inline: true
    });
  }

  // Top links
  if (linkClicks.clicksByLink.length > 0) {
    const topLinks = linkClicks.clicksByLink
      .slice(0, 5)
      .map((l) => `• ${l.label || l.platform}: ${l.count}`)
      .join('\n');
    fields.push({
      name: '🔝 Top Links',
      value: topLinks,
      inline: true
    });
  }

  // Spotify stats
  if (socialStats?.spotify) {
    const spotify = socialStats.spotify;
    let value = `**${formatNumber(spotify.followers)}** followers\nPopularity: ${spotify.popularity}/100`;
    if (spotify.topTracks && spotify.topTracks.length > 0) {
      const tracks = spotify.topTracks
        .slice(0, 3)
        .map((t) => `• ${t.name}`)
        .join('\n');
      value += `\n\n**Top Tracks:**\n${tracks}`;
    }
    fields.push({
      name: '🎵 Spotify',
      value,
      inline: false
    });
  }

  // YouTube stats
  if (socialStats?.youtube) {
    const youtube = socialStats.youtube;
    let value = `**${formatNumber(youtube.subscriberCount)}** subscribers\n${formatNumber(youtube.viewCount)} total views\n${youtube.videoCount} videos`;
    if (youtube.recentVideos && youtube.recentVideos.length > 0) {
      const videos = youtube.recentVideos
        .slice(0, 3)
        .map((v) => `• ${v.title} (${formatNumber(v.viewCount)})`)
        .join('\n');
      value += `\n\n**Recent Videos:**\n${videos}`;
    }
    fields.push({
      name: '📺 YouTube',
      value,
      inline: false
    });
  }

  return {
    title: isTest ? '🧪 Test Stats Report' : `📈 ${data.title}`,
    description: isTest
      ? 'This is a test message to verify your webhook is working correctly.'
      : `Stats report for the past ${data.title.includes('Daily') ? 'day' : data.title.includes('Weekly') ? 'week' : 'month'}.`,
    color: 0x8b5cf6, // Purple accent color
    fields,
    footer: {
      text: 'Artistack Stats'
    },
    timestamp: new Date().toISOString()
  };
}

export async function sendDiscordReport(
  webhookUrl: string,
  data: DiscordReportData
): Promise<{ success: boolean; error?: string }> {
  const embed = buildStatsEmbed(data);

  const payload: DiscordWebhookPayload = {
    username: 'Artistack Stats',
    embeds: [embed]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Discord webhook error:', response.status, text);
      return {
        success: false,
        error: `Discord returned status ${response.status}`
      };
    }

    return { success: true };
  } catch (e) {
    console.error('Discord webhook fetch error:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error'
    };
  }
}

// Scheduled report sender (to be called by a cron job or scheduler)
export async function sendScheduledReport(
  discord: DiscordSettings
): Promise<{ success: boolean; error?: string }> {
  if (!discord.webhookUrl || !discord.enabled) {
    return { success: false, error: 'Discord not configured or disabled' };
  }

  // Import analytics and social stats dynamically to avoid circular imports
  const { getOverviewStats, getPageViewStats, getLinkClickStats } = await import('./analytics');
  const { getCachedSocialStats } = await import('./social-stats');

  const days = discord.schedule === 'daily' ? 1 : discord.schedule === 'weekly' ? 7 : 30;

  const [overview, pageViews, linkClicks, socialStats] = await Promise.all([
    getOverviewStats(),
    getPageViewStats(days),
    getLinkClickStats(days),
    getCachedSocialStats()
  ]);

  const title =
    discord.schedule === 'daily'
      ? 'Daily Stats Report'
      : discord.schedule === 'weekly'
        ? 'Weekly Stats Report'
        : 'Monthly Stats Report';

  return sendDiscordReport(discord.webhookUrl, {
    title,
    overview,
    pageViews,
    linkClicks,
    socialStats
  });
}

/**
 * Send scheduled Discord report (called by scheduler)
 * Gets profile from DB, sends report, updates lastSent timestamp
 */
/**
 * Take today's send, if nobody else has.
 *
 * The check that guards this report used to read `lastSent`, send, and write
 * `lastSent` afterwards — with a webhook round trip in the middle. That is only
 * a guard against a ticker that has already finished, not one running alongside:
 * four schedulers fired at 09:00, all four read last week's timestamp, all four
 * sent, and one write landed 600ms later on top of the rest. Four identical
 * reports in the channel.
 *
 * So the slot is claimed before the send rather than recorded after it, and the
 * claim is one UPDATE with the test in its WHERE clause. SQLite settles that
 * against the write lock, so it is decided for every caller at once — whether
 * they are timers in one process or separate instances — and exactly one gets
 * `changes === 1`.
 *
 * Returns what was there before, so a failed send can put it back.
 */
function claimSend(startOfDay: number, stamp: number): { won: boolean; previous: number | null } {
  const [row] = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'discord'))
    .limit(1)
    .all();
  const previous = (row?.value as DiscordSettings | undefined)?.lastSent ?? null;

  const claimed = db.run(
    sql`UPDATE ${settings}
        SET value = json_set(${settings.value}, '$.lastSent', ${stamp})
        WHERE ${settings.key} = 'discord'
          AND (json_extract(${settings.value}, '$.lastSent') IS NULL
               OR json_extract(${settings.value}, '$.lastSent') < ${startOfDay})`
  );

  return { won: claimed.changes === 1, previous };
}

export async function sendScheduledDiscordReport(): Promise<{ success: boolean; error?: string }> {
  const discord = await getDiscordSettings();

  if (!discord?.webhookUrl || !discord.enabled) {
    return { success: false, error: 'Discord not configured or disabled' };
  }

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const { won, previous } = claimSend(midnight.getTime(), Date.now());
  if (!won) return { success: false, error: 'Already sent today' };

  let result: { success: boolean; error?: string };
  try {
    result = await sendScheduledReport(discord);
  } catch (e) {
    result = { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  /*
   * Hand the slot back if the send failed, so the next hourly tick tries again.
   *
   * Claiming first means the claim outlives a failure unless something undoes
   * it, and a weekly report that gives up for a week because Discord was down
   * for a minute is worse than the duplicate this is all guarding against.
   * A crash between the two still loses the slot — the alternative is a lease
   * with a timeout, which is a lot of machinery for one webhook.
   */
  if (!result.success) {
    await updateDiscordSettings({ lastSent: previous });
  }

  return result;
}
