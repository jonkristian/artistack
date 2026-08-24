import { createHmac, timingSafeEqual } from 'crypto';
import { eq, asc, desc, and, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { clipProjects, media, settings, type ClipProject, type Media } from './schema';
import { buildPostSheet } from './post-sheet';
import { ensurePreviewToken, previewUrl } from './clip-review';
import { tagsFor } from './tags';

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

  return queued.map((project) => {
    const eta = config?.publishEnabled ? new Date(cursor) : null;
    cursor = addDays(cursor, project.queueGapDays ?? intervalDays);
    return {
      project,
      output: project.outputMediaId ? byId.get(project.outputMediaId) : undefined,
      eta
    };
  });
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

  // Announced only after the webhook accepted it, so the channel never claims a
  // release that didn't happen. Best-effort: a Discord outage must not fail a
  // publish that already went through.
  if (config.clipPublishedWebhookUrl) {
    const announcement = {
      username: 'Artistack Clips',
      content: `**${project.name}** is out — ${sheet.ctaUrl}`,
      embeds: [
        {
          title: project.name,
          description: project.description?.trim() || undefined,
          color: 0x22c55e,
          image: output.thumbnailUrl ? { url: `${origin}${output.thumbnailUrl}` } : undefined,
          footer: { text: 'Released from Artistack' },
          timestamp: new Date().toISOString()
        }
      ]
    };
    await fetch(config.clipPublishedWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(announcement)
    }).catch((e) => console.error('[ClipQueue] Published announcement failed:', e));
  }

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

  const [next] = await db
    .select()
    .from(clipProjects)
    .where(and(eq(clipProjects.status, 'queued'), isNotNull(clipProjects.queuePosition)))
    .orderBy(asc(clipProjects.queuePosition))
    .limit(1);

  if (!next) return;

  console.log(`[ClipQueue] Releasing "${next.name}"`);
  const result = await publishClip(next.id, baseUrl);
  if (!result.success) {
    console.error('[ClipQueue] Release failed:', result.error);
  }
}
