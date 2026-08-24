import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clipProjects, media, profile, settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { buildPostSheet } from '$lib/server/post-sheet';
import type { PageServerLoad } from './$types';

/**
 * Unlisted preview of a rendered clip, reachable by token only.
 *
 * No authentication: the point is to hand the link to bandmates or a label
 * without giving them admin accounts. The token is 24 random bytes, the page is
 * noindex, and it 404s the moment the render is gone — so an old link can't
 * resurface content that's been deleted.
 */
export const load: PageServerLoad = async ({ params, url }) => {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.previewToken, params.token))
    .limit(1);

  // Same 404 for "no such token" and "nothing rendered yet", so the response
  // doesn't confirm whether a token is real.
  if (!project?.outputMediaId) {
    throw error(404, 'Not found');
  }

  // Expired links stop working on their own. 410 rather than 404 because the
  // holder already knows the clip existed — telling them it has lapsed is more
  // useful than pretending it never was.
  if (project.previewExpiresAt && project.previewExpiresAt.getTime() < Date.now()) {
    throw error(410, 'This preview link has expired');
  }

  const [clip] = await db.select().from(media).where(eq(media.id, project.outputMediaId)).limit(1);

  if (!clip) throw error(404, 'Not found');

  const [profileData] = await db.select().from(profile).limit(1);
  const [settingsData] = await db.select().from(settings).limit(1);

  const sheet = await buildPostSheet(project.id, url.origin);

  return {
    clip: {
      url: clip.url,
      poster: clip.thumbnailUrl,
      width: clip.width,
      height: clip.height,
      durationMs: clip.durationMs
    },
    project: {
      name: project.name,
      description: project.description,
      status: project.status
    },
    postSheet: sheet.markdown,
    // Token-scoped rather than the permanent /uploads path, so what gets
    // unfurled into Discord expires with the link.
    videoUrl: `${url.origin}/preview/${params.token}/video`,
    posterUrl: clip.thumbnailUrl ? `${url.origin}${clip.thumbnailUrl}` : null,
    pageUrl: `${url.origin}/preview/${params.token}`,
    artistName: profileData?.name ?? settingsData?.siteTitle ?? 'Artist',
    accentColor: settingsData?.colorAccent ?? '#8b5cf6'
  };
};
