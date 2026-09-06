import { error, redirect } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { mediaPath } from '$lib/server/paths';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { clipProjects, media } from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { runFfmpeg, probeVideo } from '$lib/server/ffmpeg';
import { getSettings } from '$lib/server/settings';
import { CLIP_STRIP_DIR } from '$lib/server/clip-strip';
import { stripColumns, FRAME_HEIGHT, STRIP_VERSION } from '$lib/clips/strip';
import type { RequestHandler } from './$types';

/**
 * The rendered clip as one long contact sheet, for the timeline to lie on.
 *
 * Frames rather than a plain ruler because the thing being dragged over it is a
 * caption, and a caption belongs to a shot. "Two thirds of the way in" is not
 * how anyone thinks about where a line of text goes; "when the guitar comes in"
 * is, and only the picture can say that.
 *
 * One image, not sixty. A strip of separate requests would be sixty round trips
 * and sixty ffmpeg invocations for something scrubbed past in a second; `fps`
 * plus `tile` gets the whole sheet out of a single pass, and the browser draws
 * it as one background.
 *
 * Cached against the rendered media row, which is the correct key by
 * construction: every render writes a new media row, so a re-render can't be
 * served the previous edit's frames.
 */
const CACHE_DIR = CLIP_STRIP_DIR;

export const GET: RequestHandler = async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect(302, '/login');

  const siteSettings = await getSettings();
  if (!siteSettings?.clipsEnabled) throw error(404, 'Not found');

  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) throw error(404, 'Clip not found');

  const [project] = await db
    .select({ outputMediaId: clipProjects.outputMediaId })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);
  if (!project?.outputMediaId) throw error(404, 'Nothing rendered yet');

  const [item] = await db.select().from(media).where(eq(media.id, project.outputMediaId)).limit(1);
  if (!item) throw error(404, 'Nothing rendered yet');

  const sourcePath = mediaPath(item.url);
  if (!existsSync(sourcePath)) throw error(404, 'The rendered file is missing');

  const cachePath = join(CACHE_DIR, `${item.id}-${STRIP_VERSION}.jpg`);

  if (!existsSync(cachePath)) {
    await mkdir(CACHE_DIR, { recursive: true });

    const probe = await probeVideo(sourcePath).catch(() => null);
    const duration = probe?.duration ?? 0;
    if (duration <= 0) throw error(404, 'The rendered file has no duration');

    /*
     * How many frames, from the clip's own shape: a tall clip needs more of
     * them across a given width than a wide one does, because each is narrower.
     */
    const aspect = probe?.height ? probe.width / probe.height : 9 / 16;
    const columns = stripColumns(duration, aspect);

    /*
     * Sampled evenly across the whole clip rather than at a fixed rate: the
     * sheet has to end where the clip ends, or every caption dragged onto it
     * would land somewhere other than where it looked.
     *
     * The extra half-frame of rate is what stops rounding from returning one
     * frame short of the tile, which ffmpeg pads with green.
     */
    const fps = (columns + 0.5) / duration;

    await runFfmpeg([
      '-y',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `fps=${fps.toFixed(6)},scale=-2:${FRAME_HEIGHT},tile=${columns}x1`,
      '-q:v',
      '5',
      cachePath
    ]);
  }

  const body = await readFile(cachePath);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Immutable in practice: the media id changes whenever the render does.
      'Cache-Control': 'private, max-age=86400'
    }
  });
};
