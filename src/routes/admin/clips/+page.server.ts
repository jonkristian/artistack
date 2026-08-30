import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireFeature } from '$lib/server/guards';
import { getClipSettings, getClipPublishingSettings } from '$lib/server/settings';
import { clipProjects, clipSources, clipPosts, media, settings } from '$lib/server/schema';
import { getQueue } from '$lib/server/clip-queue';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq, asc } from 'drizzle-orm';
import { videoSupported } from '$lib/server/ffmpeg';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  const { settings: siteSettings } = await requireFeature(request, 'clipsEnabled');
  const [clips, publishing] = await Promise.all([getClipSettings(), getClipPublishingSettings()]);

  const projects = await db.select().from(clipProjects).orderBy(desc(clipProjects.updatedAt));

  // Only the project/media pairing is needed here: the grid shows a poster and
  // a source count, not the full editor's worth of rows.
  const sources = await db
    .select({ projectId: clipSources.projectId })
    .from(clipSources)
    .orderBy(asc(clipSources.position));

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  // Which published clips actually reached a platform. A `draft` row means the
  // file was uploaded for someone to post by hand, so it doesn't count as
  // coverage — a clip carrying only those went nowhere public.
  const liveRows = await db
    .select({ projectId: clipPosts.projectId })
    .from(clipPosts)
    .where(eq(clipPosts.status, 'live'));
  const confirmedIds = [...new Set(liveRows.map((r) => r.projectId))];

  return {
    confirmedIds,
    projects,
    sources,
    media: allMedia,
    queue: await getQueue(),
    renderingAvailable: await videoSupported(),
    publishConfigured: Boolean(publishing?.publishWebhookUrl)
  };
};
