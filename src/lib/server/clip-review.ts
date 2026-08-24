import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { clipProjects, media, settings, type ClipProject } from './schema';
import { buildPostSheet } from './post-sheet';
import type { DiscordWebhookPayload } from './discord';

/**
 * Review flow for generated clips.
 *
 * A clip is shared as an unlisted preview link rather than by attaching the
 * file: Discord's upload limit is well below what a 9:16 render can reach, and
 * a link means the reviewer always sees the current render rather than a copy
 * that goes stale the moment anything is changed.
 */

/** Accent colour for review embeds (violet, matching the admin UI). */
const EMBED_COLOR = 0x8b5cf6;

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

  const [settingsData] = await db.select().from(settings).limit(1);

  // Reviews go to their own channel when one is configured, falling back to the
  // general webhook. Discord is optional either way: the preview link is the
  // deliverable, and a site with no webhook should still be able to share one.
  const webhookUrl = settingsData?.clipReviewWebhookUrl || settingsData?.discordWebhookUrl;
  if (!settingsData?.discordEnabled || !webhookUrl) {
    return { success: true, previewUrl: url };
  }

  const [output] = await db
    .select()
    .from(media)
    .where(eq(media.id, project.outputMediaId))
    .limit(1);

  const sheet = await buildPostSheet(projectId, baseUrl);

  // Discord renders a player from a bare video URL in `content`, but shows an
  // embed and a link as two separate blocks — so the clip goes in the message
  // itself and the detail stays in the embed. This is what the old n8n post did
  // with Seafile's `?raw=1`, minus the permanent share link.
  const videoUrl = `${baseUrl.replace(/\/$/, '')}/preview/${token}/video`;

  const payload: DiscordWebhookPayload = {
    username: 'Artistack Clips',
    content: videoUrl,
    embeds: [
      {
        title: `Review: ${project.name}`,
        description: [
          project.description?.trim(),
          '',
          `**[Watch the preview](${url})**`,
          `[Open in admin](${baseUrl.replace(/\/$/, '')}/admin/clips)`
        ]
          .filter((line) => line !== undefined)
          .join('\n'),
        color: EMBED_COLOR,
        fields: [
          ...(output?.durationMs
            ? [
                {
                  name: 'Length',
                  value: `${Math.round(output.durationMs / 1000)}s`,
                  inline: true
                }
              ]
            : []),
          ...(output?.width && output.height
            ? [{ name: 'Format', value: `${output.width}×${output.height}`, inline: true }]
            : []),
          { name: 'Link in post', value: sheet.ctaUrl, inline: false }
        ],
        footer: { text: 'Approve or reject in Artistack → Clips' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[ClipReview] Discord webhook error:', response.status, text);
      // The clip is still in review and the link still works, so this is a
      // partial success, not a failure to report as one.
      return {
        success: true,
        previewUrl: url,
        error: `Sent to review, but Discord returned ${response.status}`
      };
    }
  } catch (e) {
    console.error('[ClipReview] Discord webhook failed:', e);
    return {
      success: true,
      previewUrl: url,
      error: 'Sent to review, but the Discord notification failed'
    };
  }

  return { success: true, previewUrl: url };
}

/** Records an approve/reject decision. */
export async function setReviewOutcome(
  projectId: number,
  approved: boolean,
  note?: string | null
): Promise<ClipProject | undefined> {
  const [updated] = await db
    .update(clipProjects)
    .set({
      status: approved ? 'approved' : 'rejected',
      reviewNote: note?.trim() || null,
      reviewedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(clipProjects.id, projectId))
    .returning();

  return updated;
}
