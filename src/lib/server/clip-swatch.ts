/**
 * A still of the clip's own footage with some filters applied.
 *
 * Generated rather than shipped: a stock frame would show what a look does to
 * someone else's footage, which is the least useful version of the answer.
 * Reusing the renderer's own filters means a swatch can't drift from what a
 * render would actually produce.
 *
 * Cached on disk against the source file and whatever it is a swatch of, so it
 * is one ffmpeg call per pairing rather than one per page view.
 *
 * Shared by the preset tiles and the effect picker, which ask the same question
 * of the same footage and differ only in which filters they want. It lived in
 * the preset route until the effects needed it too, and two copies of "find the
 * first source, seek a second in, cache the frame" is two places for the seek
 * rule to drift.
 */
import { error } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { eq, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { clipMedia, clipProjects, clipSources, media } from '$lib/server/schema';
import { mediaPath } from '$lib/server/paths';
import { runFfmpeg, probeDuration } from '$lib/server/ffmpeg';
import { pickBrightTime } from '$lib/server/clip-render';
import { DEFAULT_ADVANCED_CONFIG } from '$lib/clips/types';

const CACHE_DIR = 'data/uploads/.preset-previews';
const WIDTH = 480;

export async function clipSwatch(
  projectId: number,
  /** Unique per look, and part of the cache key. */
  key: string,
  filters: string[]
): Promise<Response> {
  if (!Number.isInteger(projectId)) throw error(404, 'Clip not found');

  const [project] = await db
    .select({ id: clipProjects.id })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);
  if (!project) throw error(404, 'Clip not found');

  /*
   * The first shot on the timeline, or failing that the first file in the pool.
   *
   * Only placements used to count, which meant adding footage to a clip and not
   * yet placing it left every swatch saying "add footage to preview" — with the
   * footage sitting right above them. Choosing a look is something you do
   * *before* arranging, so the moment there is a file to take a frame from is
   * the moment the pickers should work.
   *
   * Placement still wins where there is one: the first shot is what the clip
   * opens on, so it is the frame most worth grading.
   */
  const [placed] = await db
    .select({ mediaId: clipSources.mediaId })
    .from(clipSources)
    .where(eq(clipSources.projectId, projectId))
    .orderBy(asc(clipSources.position))
    .limit(1);

  const [pooled] = placed
    ? []
    : await db
        .select({ mediaId: clipMedia.mediaId })
        .from(clipMedia)
        .where(eq(clipMedia.projectId, projectId))
        .orderBy(asc(clipMedia.position))
        .limit(1);

  const mediaId = placed?.mediaId ?? pooled?.mediaId;
  if (!mediaId) throw error(404, 'No footage yet');

  const [item] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!item) throw error(404, 'Source file is missing');

  const sourcePath = mediaPath(item.url);
  if (!existsSync(sourcePath)) throw error(404, 'Source file is missing');

  const cachePath = join(CACHE_DIR, `${item.id}-${key}.jpg`);

  if (!existsSync(cachePath)) {
    await mkdir(CACHE_DIR, { recursive: true });

    /*
     * A frame with something in it, not simply the one a second in.
     *
     * This took whatever was at 00:01, which is fine until a clip opens on a
     * dark shot — and then every swatch in the picker is the same near-black
     * rectangle, because a grade applied to black is black. The looks became
     * indistinguishable exactly where telling them apart was the point.
     *
     * `pickBrightTime` is what the cover still already uses for the same
     * reason. It walks a handful of timestamps and takes the first that is not
     * near-black, falling back to the brightest it saw.
     */
    const duration = await probeDuration(sourcePath).catch(() => 0);
    const at =
      duration > 0.2
        ? await pickBrightTime(sourcePath, Math.min(duration, 6), DEFAULT_ADVANCED_CONFIG)
        : 0;

    await runFfmpeg([
      '-y',
      '-loglevel',
      'error',
      '-ss',
      at.toFixed(2),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      [`scale=${WIDTH}:-2`, ...filters].join(','),
      '-q:v',
      '4',
      cachePath
    ]);
  }

  const body = await readFile(cachePath);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Keyed by source id and look, so a hit is always the right image;
      // adding footage changes the first source and therefore the key.
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
