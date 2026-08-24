import { error } from '@sveltejs/kit';
import { stat } from 'fs/promises';
import { db } from '$lib/server/db';
import { clipProjects, media } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { mediaPath } from '$lib/server/paths';
import { serveFile } from '$lib/server/serve-file';
import type { RequestHandler } from './$types';

/**
 * The rendered clip, reachable by preview token rather than by its permanent
 * /uploads path.
 *
 * Exists so a review link can be handed to Discord — which embeds a direct
 * video URL into a player, but has nothing to do with a bare page link. Serving
 * it here rather than pointing at /uploads means the share can be revoked
 * (rotate the token) and expires on its own, instead of leaking a URL that
 * works forever.
 *
 * Range requests are handled by serveFile, so scrubbing works and a 500MB clip
 * never lands in memory.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const [project] = await db
    .select({
      outputMediaId: clipProjects.outputMediaId,
      expiresAt: clipProjects.previewExpiresAt
    })
    .from(clipProjects)
    .where(eq(clipProjects.previewToken, params.token))
    .limit(1);

  if (!project) throw error(404, 'Not found');
  if (project.expiresAt && project.expiresAt.getTime() < Date.now()) {
    throw error(410, 'This preview link has expired');
  }
  if (!project.outputMediaId) throw error(404, 'Nothing rendered yet');

  const [item] = await db
    .select({ url: media.url })
    .from(media)
    .where(eq(media.id, project.outputMediaId))
    .limit(1);
  if (!item) throw error(404, 'Not found');

  const filePath = mediaPath(item.url);
  if (!(await stat(filePath).catch(() => null))) throw error(404, 'Not found');

  return serveFile(filePath, request, {
    headers: {
      // Unlisted, like the preview page it belongs to.
      'X-Robots-Tag': 'noindex, nofollow',
      // Public so Discord's media proxy will fetch and embed it; short max-age
      // because the link expires. The URL is unguessable, and the token check
      // above is what actually gates access.
      'Cache-Control': 'public, max-age=600'
    }
  });
};
