import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clipProjects, clipSources, renderJobs, media, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq, asc } from 'drizzle-orm';
import { videoSupported } from '$lib/server/ffmpeg';
import { tagsFor, listTags } from '$lib/server/tags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  const [siteSettings] = await db.select().from(settings).limit(1);
  if (!siteSettings?.clipsEnabled) {
    throw redirect(302, '/admin/integrations');
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw error(404, 'Clip not found');

  const [project] = await db.select().from(clipProjects).where(eq(clipProjects.id, id)).limit(1);
  if (!project) throw error(404, 'Clip not found');

  const sources = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, id))
    .orderBy(asc(clipSources.position));

  // Only the most recent job drives the UI; older ones stay in the table for
  // debugging a failed render.
  const [latestJob] = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.projectId, id))
    .orderBy(desc(renderJobs.createdAt))
    .limit(1);

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  const designatedIds = (siteSettings.clipGraphicsMediaIds ?? []) as number[];
  const designatedGraphics = allMedia.filter((m) => designatedIds.includes(m.id));

  return {
    project,
    tags: (await tagsFor('clip', project.id)).map((t) => t.name),
    // The whole vocabulary, for the tag input's autocomplete.
    allTags: (await listTags()).map((t) => t.name),
    sources,
    latestJob: latestJob ?? null,
    media: allMedia,
    // The images designated as clip graphics, resolved to media rows so the
    // Branding picker can show them without a second round trip.
    graphics: designatedGraphics,
    defaultGraphicMediaId: siteSettings.defaultClipGraphicMediaId ?? null,
    // Drives the "install ffmpeg" notice instead of letting renders fail late.
    renderingAvailable: await videoSupported(),
    // Publishing needs a webhook target; without one the release controls are
    // shown but disabled rather than hidden, so the gap is discoverable.
    publishConfigured: Boolean(siteSettings.publishWebhookUrl)
  };
};
