import { createHmac, timingSafeEqual } from 'crypto';
import { eq, asc, desc, and, isNotNull, isNull, lt, gt } from 'drizzle-orm';
import { db } from './db';
import { clipProjects, clipPosts, media, settings, type ClipProject, type Media } from './schema';
import { buildPostSheet, campaignUrlFor } from './post-sheet';
import { ensurePreviewToken, previewUrl } from './clip-review';
import { tagsFor } from './tags';
import { PLATFORM_NAMES } from '../clips/types';

/**
 * Drip-release queue for approved clips.
 *
 * Ordering lives in the database rather than in a manifest file, which is the
 * one structural change from The How's `.order` approach — it makes reordering
 * atomic and lets the ETA be computed instead of parsed.
 *
 * When a clip comes due, an outbound webhook fires carrying the clip URL and
 * post sheet. Artistack deliberately doesn't own platform credentials: the
 * consumer (n8n today) does, because app review with Meta and TikTok is
 * required either way and doesn't get cheaper by moving the code in here.
 */

/**
 * Checks an inbound callback really came from the workflow we sent the clip to.
 *
 * Sits beside the signing above deliberately: both sides use `publish_secret`
 * and the same `sha256=<hex>` shape over the raw body, and splitting them is
 * how they drift apart. Returns false when no secret is configured — an
 * unauthenticated write path is worse than a missing feature.
 */
export async function verifyPublishSignature(
  rawBody: string,
  header: string | null
): Promise<boolean> {
  const [config] = await db.select().from(settings).limit(1);
  if (!config?.publishSecret || !header) return false;

  const expected =
    'sha256=' + createHmac('sha256', config.publishSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface QueueEntry {
  project: ClipProject;
  output?: Media;
  /** Projected release time, given the cadence and any per-clip gaps ahead of it. */
  eta: Date | null;
}

/** Approved and queued clips, in release order. */
export async function getQueue(): Promise<QueueEntry[]> {
  const queued = await db
    .select()
    .from(clipProjects)
    .where(and(eq(clipProjects.status, 'queued'), isNotNull(clipProjects.queuePosition)))
    .orderBy(asc(clipProjects.queuePosition));

  const outputs = await db.select().from(media);
  const byId = new Map(outputs.map((m) => [m.id, m]));

  const [config] = await db.select().from(settings).limit(1);
  const intervalDays = config?.publishIntervalDays ?? 3;
  const hour = config?.publishHour ?? 10;
  const lastSent = config?.publishLastSent ?? null;

  // The first slot is one interval after the last release (or today if nothing
  // has gone out yet); each subsequent slot adds that clip's own gap.
  let cursor = nextSlot(lastSent, intervalDays, hour);

  const entries = queued.map((project) => {
    // A pinned clip keeps its own date and doesn't advance the cursor — it isn't
    // taking a drip slot, so the clips around it shouldn't shuffle because of it.
    const eta = !config?.publishEnabled
      ? null
      : project.scheduledFor
        ? new Date(project.scheduledFor)
        : new Date(cursor);

    if (!project.scheduledFor) {
      cursor = addDays(cursor, project.queueGapDays ?? intervalDays);
    }

    return {
      project,
      output: project.outputMediaId ? byId.get(project.outputMediaId) : undefined,
      eta
    };
  });

  // Listed in the order they'll actually go out, which is the only order that
  // means anything once dates and drip slots are mixed together.
  return entries.sort((a, b) => (a.eta?.getTime() ?? Infinity) - (b.eta?.getTime() ?? Infinity));
}

/**
 * Where a clip added to the back of the queue would land, so the queue dialog
 * can say "Friday 28 August, 10:00" instead of "the next available slot".
 */
export async function projectedNextSlot(): Promise<Date | null> {
  const [config] = await db.select().from(settings).limit(1);
  if (!config?.publishEnabled) return null;

  const intervalDays = config.publishIntervalDays ?? 3;
  const queue = await getQueue();
  const last = queue.at(-1);

  if (!last?.eta) {
    return nextSlot(config.publishLastSent ?? null, intervalDays, config.publishHour ?? 10);
  }

  return addDays(last.eta, last.project.queueGapDays ?? intervalDays);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The first release slot at or after now, given the last send. */
function nextSlot(lastSent: Date | null, intervalDays: number, hour: number): Date {
  const now = new Date();
  let slot: Date;

  if (lastSent) {
    slot = addDays(new Date(lastSent), intervalDays);
  } else {
    slot = new Date(now);
  }
  slot.setHours(hour, 0, 0, 0);

  // Never project a slot in the past — a queue that's been idle should read as
  // "next release today/tomorrow", not as a backlog of missed dates.
  while (slot < now) slot = addDays(slot, intervalDays);

  return slot;
}

/** Adds an approved clip to the back of the queue. */
export async function enqueueForRelease(
  projectId: number
): Promise<{ success: boolean; message?: string }> {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) return { success: false, message: 'Clip not found' };
  if (project.status !== 'approved') {
    return { success: false, message: 'Only approved clips can be queued' };
  }

  const existing = await db
    .select({ position: clipProjects.queuePosition })
    .from(clipProjects)
    .where(eq(clipProjects.status, 'queued'));

  const position = existing.reduce((max, row) => Math.max(max, row.position ?? 0), 0) + 1;

  await db
    .update(clipProjects)
    .set({ status: 'queued', queuePosition: position, updatedAt: new Date() })
    .where(eq(clipProjects.id, projectId));

  return { success: true };
}

/** Pulls a clip out of the queue, back to approved. */
export async function dequeue(projectId: number): Promise<void> {
  await db
    .update(clipProjects)
    .set({ status: 'approved', queuePosition: null, updatedAt: new Date() })
    .where(eq(clipProjects.id, projectId));
}

/** Rewrites queue positions from an explicit order. */
export async function reorderQueue(orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(clipProjects)
      .set({ queuePosition: i + 1 })
      .where(eq(clipProjects.id, orderedIds[i]));
  }
}

export interface PublishPayload {
  clip: {
    id: number;
    name: string;
    description: string | null;
    tags: string[];
    videoUrl: string;
    posterUrl: string | null;
    previewUrl: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
  };
  postSheet: string;
  /** The tracked call-to-action link the caption should use. */
  link: string;
  publishedAt: string;
}

/**
 * Fires the publish webhook for one clip and marks it published.
 *
 * URLs are absolute so the consumer can fetch the file directly; the post sheet
 * travels as markdown so whatever builds the platform caption can parse or pass
 * it through unchanged.
 */
export async function publishClip(
  projectId: number,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project?.outputMediaId) {
    return { success: false, error: 'Clip has no render to publish' };
  }

  const [config] = await db.select().from(settings).limit(1);
  if (!config?.publishWebhookUrl) {
    return { success: false, error: 'No publish webhook configured' };
  }

  const [output] = await db
    .select()
    .from(media)
    .where(eq(media.id, project.outputMediaId))
    .limit(1);

  if (!output) return { success: false, error: 'Rendered file is missing' };

  const origin = baseUrl.replace(/\/$/, '');
  const sheet = await buildPostSheet(projectId, origin);
  const token = await ensurePreviewToken(projectId);

  const payload: PublishPayload = {
    clip: {
      id: project.id,
      name: project.name,
      description: project.description,
      tags: (await tagsFor('clip', project.id)).map((t) => t.name),
      videoUrl: `${origin}${output.url}`,
      posterUrl: output.thumbnailUrl ? `${origin}${output.thumbnailUrl}` : null,
      previewUrl: previewUrl(origin, token),
      width: output.width,
      height: output.height,
      durationMs: output.durationMs
    },
    postSheet: sheet.markdown,
    link: sheet.ctaUrl,
    publishedAt: new Date().toISOString()
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Optional HMAC so the receiver can verify the call really came from here.
  if (config.publishSecret) {
    headers['X-Artistack-Signature'] =
      'sha256=' + createHmac('sha256', config.publishSecret).update(body).digest('hex');
  }

  try {
    const response = await fetch(config.publishWebhookUrl, { method: 'POST', headers, body });

    if (!response.ok) {
      const text = await response.text();
      console.error('[ClipQueue] Publish webhook failed:', response.status, text);
      return { success: false, error: `Webhook returned ${response.status}` };
    }
  } catch (e) {
    console.error('[ClipQueue] Publish webhook error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Webhook request failed' };
  }

  // Only mark published once the webhook has actually accepted it — a failed
  // send leaves the clip queued so the next tick retries rather than losing it.
  await db
    .update(clipProjects)
    .set({
      status: 'published',
      queuePosition: null,
      publishedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(clipProjects.id, projectId));

  await db.update(settings).set({ publishLastSent: new Date() }).where(eq(settings.id, config.id));

  // The announcement waits for announceRelease(): at this point the webhook has
  // only been accepted, so there are no platform links to put in it yet.

  return { success: true };
}

/**
 * Releases the front of the queue if a slot is due.
 * Called from the hourly scheduler; releases at most one clip per tick.
 */
export async function runReleaseTick(baseUrl: string): Promise<void> {
  const [config] = await db.select().from(settings).limit(1);
  if (!config?.publishEnabled || !config.publishWebhookUrl) return;

  const now = new Date();

  // A pinned date is a decision about this clip, so it outranks both the cadence
  // and the release hour — you picked a time because something happens then.
  // Checked before the hour gate for that reason. Oldest due first, so a backlog
  // after downtime goes out in the order it was meant to.
  const [pinned] = await db
    .select()
    .from(clipProjects)
    .where(
      and(
        eq(clipProjects.status, 'queued'),
        isNotNull(clipProjects.scheduledFor),
        lt(clipProjects.scheduledFor, now)
      )
    )
    .orderBy(asc(clipProjects.scheduledFor))
    .limit(1);

  if (pinned) {
    console.log(`[ClipQueue] Releasing "${pinned.name}" on its scheduled date`);
    const result = await publishClip(pinned.id, baseUrl);
    if (!result.success) console.error('[ClipQueue] Scheduled release failed:', result.error);
    return;
  }

  if (now.getHours() !== (config.publishHour ?? 10)) return;

  const intervalDays = config.publishIntervalDays ?? 3;

  // Respect the gap the previously released clip asked for, falling back to the
  // site-wide cadence.
  if (config.publishLastSent) {
    const [lastPublished] = await db
      .select({ gap: clipProjects.queueGapDays })
      .from(clipProjects)
      .where(eq(clipProjects.status, 'published'))
      .orderBy(desc(clipProjects.publishedAt))
      .limit(1);

    const due = addDays(new Date(config.publishLastSent), lastPublished?.gap ?? intervalDays);
    due.setHours(config.publishHour ?? 10, 0, 0, 0);
    if (now < due) return;
  }

  // Pinned clips are skipped here: they're waiting for their own date, not for
  // their turn, and letting the drip grab one early defeats the point of pinning.
  const [next] = await db
    .select()
    .from(clipProjects)
    .where(
      and(
        eq(clipProjects.status, 'queued'),
        isNotNull(clipProjects.queuePosition),
        isNull(clipProjects.scheduledFor)
      )
    )
    .orderBy(asc(clipProjects.queuePosition))
    .limit(1);

  if (!next) return;

  console.log(`[ClipQueue] Releasing "${next.name}"`);
  const result = await publishClip(next.id, baseUrl);
  if (!result.success) {
    console.error('[ClipQueue] Release failed:', result.error);
  }
}

/** How long a release gets to report in before silence counts as a fault. */
const COVERAGE_GRACE_MINUTES = 30;

/**
 * How many platforms a release is expected to reach. A constant rather than a
 * setting: it changes when the band adds a platform to the posting workflow,
 * which is a code change anyway, not something to tune from the admin.
 */
export const EXPECTED_PLATFORMS = 4;

/**
 * Announces a release to Discord, once, with the links it actually reached.
 *
 * Held until the platforms report rather than fired when the publish webhook is
 * accepted: at that moment nothing has posted yet, so there is nothing to link
 * to. Called from the callback the moment the last platform lands, and again
 * from the coverage check after the grace period so a release that only made it
 * to three platforms still gets announced with the three it has.
 *
 * A `draft` row is a file uploaded but not posted — TikTok, today — so it has no
 * URL and reads as something for a human to finish, the same as in the editor.
 */
export async function announceRelease(projectId: number, baseUrl: string): Promise<void> {
  const [config] = await db.select().from(settings).limit(1);
  if (!config?.clipPublishedWebhookUrl) return;

  const [project] = await db
    .select()
    .from(clipProjects)
    .where(and(eq(clipProjects.id, projectId), isNull(clipProjects.announcedAt)))
    .limit(1);
  if (!project) return;

  const posts = await db.select().from(clipPosts).where(eq(clipPosts.projectId, projectId));
  const landed = posts.filter((p) => p.status !== 'failed');
  if (landed.length === 0) return;

  // Claim it before posting: the callback and the coverage tick can both arrive
  // here, and a double announcement is worse than a missed one.
  await db
    .update(clipProjects)
    .set({ announcedAt: new Date() })
    .where(eq(clipProjects.id, projectId));

  const origin = baseUrl.replace(/\/$/, '');
  const [output] = project.outputMediaId
    ? await db.select().from(media).where(eq(media.id, project.outputMediaId)).limit(1)
    : [];

  const lines = landed.map((p) => {
    const name = PLATFORM_NAMES[p.platform] ?? p.platform;
    if (p.status === 'draft') return `**${name}** — uploaded, post it by hand`;
    return p.url ? `**${name}** — ${p.url}` : `**${name}** — live`;
  });

  // Anything left to post by hand needs the caption and hashtags to hand, not
  // just the news that it's out. The preview page carries the video and the
  // post sheet with copy buttons, so it's the one link worth adding — and only
  // when there's actually manual work waiting.
  if (landed.some((p) => p.status === 'draft')) {
    const token = await ensurePreviewToken(projectId);
    lines.push('', `Caption and hashtags to copy: ${previewUrl(origin, token)}`);
  }

  await fetch(config.clipPublishedWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Artistack Clips',
      content: `**${project.name}** is out — ${campaignUrlFor(project, origin)}`,
      embeds: [
        {
          title: project.name,
          description: [project.description?.trim(), lines.join('\n')].filter(Boolean).join('\n\n'),
          color: 0x22c55e,
          image: output?.thumbnailUrl ? { url: `${origin}${output.thumbnailUrl}` } : undefined,
          footer: { text: 'Released from Artistack' },
          timestamp: new Date().toISOString()
        }
      ]
    })
  }).catch((e) => console.error('[ClipQueue] Release announcement failed:', e));
}

/**
 * Alerts when a published clip didn't reach the platforms it should have.
 *
 * The alarm lives here rather than in the publishing workflow because Artistack
 * knows what was *supposed* to happen; the workflow only knows what it tried.
 * If that workflow is down, or never receives the dispatch, it cannot raise a
 * hand about it — this can.
 *
 * Three shapes, all caught by comparing rows against the expected count:
 *   - nothing arrived at all (workflow down, or every dispatch died)
 *   - a platform reported failure
 *   - a platform died before reporting, so no row ever comes
 *
 * The grace period matters: Instagram's container polling routinely runs for
 * minutes on a perfectly good post, and an alarm that cries during normal
 * processing is one people stop reading.
 */
export async function checkPublishCoverage(baseUrl: string): Promise<void> {
  const [config] = await db.select().from(settings).limit(1);
  const webhook = config?.clipReviewWebhookUrl || config?.discordWebhookUrl;
  if (!webhook) return;

  const now = Date.now();
  const graceCutoff = new Date(now - COVERAGE_GRACE_MINUTES * 60_000);
  // Bounded window so enabling this doesn't alert about the back catalogue.
  const windowStart = new Date(now - 24 * 60 * 60_000);

  const candidates = await db
    .select()
    .from(clipProjects)
    .where(
      and(
        eq(clipProjects.status, 'published'),
        isNull(clipProjects.publishAlertSentAt),
        isNotNull(clipProjects.publishedAt),
        lt(clipProjects.publishedAt, graceCutoff),
        gt(clipProjects.publishedAt, windowStart)
      )
    );

  for (const project of candidates) {
    const posts = await db
      .select({ platform: clipPosts.platform, status: clipPosts.status })
      .from(clipPosts)
      .where(eq(clipPosts.projectId, project.id));

    // Past the grace period, so this is as complete as the release is going to
    // get. Announce what did land before deciding whether to raise the alarm.
    await announceRelease(project.id, baseUrl);

    const failed = posts.filter((p) => p.status === 'failed');
    const reached = posts.filter((p) => p.status !== 'failed');
    const short = reached.length < EXPECTED_PLATFORMS;

    if (posts.length > 0 && failed.length === 0 && !short) continue;

    const detail = posts.length
      ? posts.map((p) => `${p.platform}: ${p.status}`).join(', ')
      : 'no platform reported back at all';

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Artistack Clips',
        embeds: [
          {
            title: `Publish may have failed: ${project.name}`,
            description: [
              `Released ${COVERAGE_GRACE_MINUTES}+ minutes ago and only ${reached.length}/${EXPECTED_PLATFORMS} platforms reported success.`,
              '',
              detail,
              '',
              `[Open in admin](${baseUrl.replace(/\/$/, '')}/admin/clips/${project.id})`
            ].join('\n'),
            color: 0xdc2626,
            timestamp: new Date().toISOString()
          }
        ]
      })
    }).catch((e) => console.error('[ClipQueue] Coverage alert failed:', e));

    await db
      .update(clipProjects)
      .set({ publishAlertSentAt: new Date() })
      .where(eq(clipProjects.id, project.id));
  }
}
