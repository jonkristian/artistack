import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { getClipSettings, getDiscordSettings } from './settings';
import { clipProjects, media, settings, type ClipProject } from './schema';
import { buildPostSheet } from './post-sheet';
import { quietLinks, type DiscordWebhookPayload } from './discord';

/**
 * Review flow for generated clips.
 *
 * A clip is shared as an unlisted preview link rather than by attaching the
 * file: Discord's upload limit is well below what a 9:16 render can reach, and
 * a link means the reviewer always sees the current render rather than a copy
 * that goes stale the moment anything is changed.
 */

/**
 * Returns the project's preview token, creating one on first use.
 *
 * Generated lazily so a clip that has never been shared has no reachable URL —
 * there's nothing to guess and nothing to leak.
 */
/** How long a preview link stays valid after it's issued or refreshed. */
export const PREVIEW_TTL_DAYS = 7;

function previewExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + PREVIEW_TTL_DAYS);
  return d;
}

export async function ensurePreviewToken(projectId: number): Promise<string> {
  const [project] = await db
    .select({ previewToken: clipProjects.previewToken })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) throw new Error('Clip project not found');

  // An existing token gets its window extended rather than replaced — the link
  // already in Discord keeps working, it just doesn't expire mid-review.
  if (project.previewToken) {
    await db
      .update(clipProjects)
      .set({ previewExpiresAt: previewExpiry() })
      .where(eq(clipProjects.id, projectId));
    return project.previewToken;
  }

  // 24 bytes of CSPRNG output, url-safe. Long enough that guessing is hopeless.
  const token = randomBytes(24).toString('base64url');

  await db
    .update(clipProjects)
    .set({ previewToken: token, previewExpiresAt: previewExpiry(), updatedAt: new Date() })
    .where(eq(clipProjects.id, projectId));

  return token;
}

/** Invalidates the current preview link by issuing a new token. */
export async function rotatePreviewToken(projectId: number): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await db
    .update(clipProjects)
    .set({ previewToken: token, previewExpiresAt: previewExpiry(), updatedAt: new Date() })
    .where(eq(clipProjects.id, projectId));
  return token;
}

export function previewUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/preview/${token}`;
}

/**
 * Posts a clip to Discord for review.
 *
 * Uses the same webhook the stats reports use — no bot, no gateway connection,
 * no extra credentials. The tradeoff is that Discord can't write a verdict
 * back, so approval happens in the admin UI; the message carries a direct link
 * to it so that's one click away.
 */
export async function submitForReview(
  projectId: number,
  baseUrl: string
): Promise<{ success: boolean; previewUrl: string; error?: string }> {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) throw new Error('Clip project not found');
  if (!project.outputMediaId) {
    return { success: false, previewUrl: '', error: 'Render the clip before sending it to review' };
  }

  const token = await ensurePreviewToken(projectId);
  const url = previewUrl(baseUrl, token);

  await db
    .update(clipProjects)
    .set({ status: 'review', reviewNote: null, reviewedAt: null, updatedAt: new Date() })
    .where(eq(clipProjects.id, projectId));

  const [clips, discord] = await Promise.all([getClipSettings(), getDiscordSettings()]);

  // Reviews go to their own channel when one is configured, falling back to the
  // general webhook. Discord is optional either way: the preview link is the
  // deliverable, and a site with no webhook should still be able to share one.
  const webhookUrl = clips?.reviewWebhookUrl || discord?.webhookUrl;
  if (!discord?.enabled || !webhookUrl) {
    return { success: true, previewUrl: url };
  }

  const [output] = await db
    .select()
    .from(media)
    .where(eq(media.id, project.outputMediaId))
    .limit(1);

  const sheet = await buildPostSheet(projectId, baseUrl);

  const videoUrl = `${baseUrl.replace(/\/$/, '')}/preview/${token}/video.mp4`;

  /*
   * Everything in the message itself, with no embed of its own.
   *
   * The clip is the point of the post, and Discord will only build a player out
   * of a bare video URL when the message carries no embeds — supply one and the
   * URL degrades to a blue line of text above it. Nor can the embed hold the
   * clip instead: `video` is among the fields a webhook is explicitly not
   * allowed to set, alongside `type`, `provider` and image dimensions.
   *
   * So the detail is written as markdown rather than built as an embed. What's
   * lost is the coloured bar and the field grid, which only exist inside one.
   * What's gained is the clip playing where it's being talked about, in one
   * message rather than two.
   *
   * Every link except the video is bracketed, or Discord unfurls those too and
   * the player ends up beneath a stack of link cards.
   */
  const admin = `${baseUrl.replace(/\/$/, '')}/admin/clips`;
  const facts = [
    output?.durationMs ? `**${Math.round(output.durationMs / 1000)}s**` : null,
    output?.width && output.height ? `**${output.width}×${output.height}**` : null,
    `[Link in post](<${sheet.ctaUrl}>)`
  ].filter(Boolean);

  const content = [
    `## Review: ${project.name}`,
    project.description?.trim() ? quietLinks(project.description.trim()) : null,
    '',
    facts.join(' · '),
    `[Watch the preview](<${url}>) · [Open in admin](<${admin}>)`,
    '-# Approve or reject in Artistack → Clips',
    // Last and unbracketed: this is the one meant to become a player.
    videoUrl
  ]
    .filter((line) => line !== null)
    .join('\n');

  const payload: DiscordWebhookPayload = { username: 'Artistack Clips', content };

  /**
   * One webhook post. Returns what went wrong rather than throwing, because
   * the clip is in review either way — Discord is how people hear about it,
   * not what makes it true.
   */
  const post = async (body: DiscordWebhookPayload): Promise<string | null> => {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (response.ok) return null;

      const text = await response.text();
      console.error('[ClipReview] Discord webhook error:', response.status, text);
      return `Sent to review, but Discord returned ${response.status}`;
    } catch (e) {
      console.error('[ClipReview] Discord webhook failed:', e);
      return 'Sent to review, but the Discord notification failed';
    }
  };

  // The clip is still in review and the link still works, so a webhook that
  // failed is a partial success, not a failure to report as one.
  const error = (await post(payload)) ?? undefined;

  return { success: true, previewUrl: url, ...(error ? { error } : {}) };
}
