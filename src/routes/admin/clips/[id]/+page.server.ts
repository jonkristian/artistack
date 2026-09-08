import {
  getClipSettings,
  getClipPublishingSettings,
  updateClipSettings
} from '$lib/server/settings';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireFeature } from '$lib/server/guards';
import {
  clipProjects,
  clipSources,
  clipAudio,
  clipMedia,
  clipPosts,
  renderJobs,
  media,
  settings
} from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq, asc } from 'drizzle-orm';
import { queueWaveform, waveformIsCurrent } from '$lib/server/media-waveform';
import { queuePreviewRendition } from '$lib/server/media-preview';
import { videoSupported } from '$lib/server/ffmpeg';
import { tagsFor, listTags } from '$lib/server/tags';
import { projectedNextSlot } from '$lib/server/clip-queue';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  const { settings: siteSettings } = await requireFeature(request, 'clipsEnabled');
  const [clips, publishing] = await Promise.all([getClipSettings(), getClipPublishingSettings()]);

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, 'Clip not found');

  const [project] = await db.select().from(clipProjects).where(eq(clipProjects.id, id)).limit(1);
  if (!project) throw error(404, 'Clip not found');

  const sources = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, id))
    .orderBy(asc(clipSources.position));

  const audio = await db
    .select()
    .from(clipAudio)
    .where(eq(clipAudio.projectId, id))
    .orderBy(asc(clipAudio.position));

  // What the clip has to work with, whether or not any of it is placed yet.
  const pool = await db
    .select()
    .from(clipMedia)
    .where(eq(clipMedia.projectId, id))
    .orderBy(asc(clipMedia.position));

  // Only the most recent job drives the UI; older ones stay in the table for
  // debugging a failed render.
  const [latestJob] = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.projectId, id))
    .orderBy(desc(renderJobs.createdAt))
    .limit(1);

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  /*
   * Anything this clip uses that hasn't got its waveform yet.
   *
   * Opening the editor is the moment one becomes worth having, and it covers
   * files that arrived before this existed as well as any that failed the first
   * time. The queue is idempotent and the generator returns early once the
   * column is set, so the cost of asking again is a map lookup.
   */
  for (const row of audio) {
    const item = allMedia.find((m) => m.id === row.mediaId);
    // Not "has one" — "has the current one". Asking the weaker question is how
    // a change to how these are drawn reaches nothing that already exists.
    if (item && !waveformIsCurrent(item.waveformUrl)) queueWaveform(item.id);
  }

  /*
   * And the footage's small copies, for the same reason.
   *
   * These were meant to be made on upload and never were — the temporary
   * filename gave ffmpeg no extension to pick a muxer from, so every one failed
   * into the log while every reader quietly fell back to the original. Asking
   * again here catches everything uploaded before that was fixed.
   */
  for (const row of sources) {
    const item = allMedia.find((m) => m.id === row.mediaId);
    if (item && !item.previewUrl) queuePreviewRendition(item.id);
  }

  const designatedIds = (clips?.graphicsMediaIds ?? []) as number[];
  const designatedGraphics = allMedia.filter((m) => designatedIds.includes(m.id));

  const posts = await db
    .select()
    .from(clipPosts)
    .where(eq(clipPosts.projectId, id))
    .orderBy(asc(clipPosts.platform));

  return {
    project,
    /** The proof, when one exists — it drives the editor's own preview. */
    proofMedia: project.proofMediaId
      ? (allMedia.find((m) => m.id === project.proofMediaId) ?? null)
      : null,
    posts,
    tags: (await tagsFor('clip', project.id)).map((t) => t.name),
    // The whole vocabulary, for the tag input's autocomplete.
    allTags: (await listTags()).map((t) => t.name),
    sources,
    audio,
    pool,
    latestJob: latestJob ?? null,
    media: allMedia,
    // The images designated as clip graphics, resolved to media rows so the
    // Branding picker can show them without a second round trip.
    graphics: designatedGraphics,
    defaultGraphicMediaId: clips?.defaultGraphicMediaId ?? null,
    // Drives the "install ffmpeg" notice instead of letting renders fail late.
    renderingAvailable: await videoSupported(),
    // Publishing needs a webhook target; without one the release controls are
    // shown but disabled rather than hidden, so the gap is discoverable.
    publishConfigured: Boolean(publishing?.publishWebhookUrl),
    // Where this clip would land if queued now, for the queue dialog.
    nextSlot: await projectedNextSlot()
  };
};
