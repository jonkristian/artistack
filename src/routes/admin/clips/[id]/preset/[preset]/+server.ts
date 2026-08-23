import { error, redirect } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { mediaPath } from '$lib/server/paths';
import { eq, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { clipProjects, clipSources, media, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { runFfmpeg, probeDuration } from '$lib/server/ffmpeg';
import { previewFilters } from '$lib/server/clip-render';
import { CLIP_PRESETS } from '$lib/clips/types';
import type { RequestHandler } from './$types';

/**
 * A still of the clip's own footage with a preset's grade applied.
 *
 * Generated rather than shipped: a stock frame would show what the preset does
 * to someone else's footage, which is the least useful version of the answer.
 * Reusing the renderer's own filters means the swatch can't drift from what a
 * render would actually produce.
 *
 * Cached on disk against the source file and preset, so it's one ffmpeg call
 * per pairing rather than one per page view.
 */
const CACHE_DIR = 'data/uploads/.preset-previews';
const WIDTH = 480;

export const GET: RequestHandler = async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect(302, '/login');

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') throw redirect(302, '/admin');

  const [siteSettings] = await db.select().from(settings).limit(1);
  if (!siteSettings?.clipsEnabled) throw error(404, 'Not found');

  const preset = CLIP_PRESETS.find((p) => p.id === params.preset);
  if (!preset) throw error(404, 'Unknown preset');

  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) throw error(404, 'Clip not found');

  const [project] = await db
    .select({ id: clipProjects.id })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);
  if (!project) throw error(404, 'Clip not found');

  // The first source is what the intro lands on, so it's the frame most worth
  // grading. Nothing to preview before any footage is added.
  const [first] = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, projectId))
    .orderBy(asc(clipSources.position))
    .limit(1);
  if (!first) throw error(404, 'No sources yet');

  const [item] = await db.select().from(media).where(eq(media.id, first.mediaId)).limit(1);
  if (!item) throw error(404, 'Source file is missing');

  const sourcePath = mediaPath(item.url);
  if (!existsSync(sourcePath)) throw error(404, 'Source file is missing');

  const cachePath = join(CACHE_DIR, `${item.id}-${preset.id}.jpg`);

  if (!existsSync(cachePath)) {
    await mkdir(CACHE_DIR, { recursive: true });

    // Same seek rule as the poster frame: a clip's opening frames are often
    // black or still settling, so take one a second in when there's room.
    const duration = await probeDuration(sourcePath).catch(() => 0);
    const at = duration > 2 ? 1 : Math.max(0, duration / 2);

    const chain = [`scale=${WIDTH}:-2`, ...previewFilters(preset.config)].join(',');

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
      chain,
      '-q:v',
      '4',
      cachePath
    ]);
  }

  const body = await readFile(cachePath);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Keyed by source id and preset, so a hit is always the right image;
      // adding footage changes the first source and therefore the key.
      'Cache-Control': 'private, max-age=3600'
    }
  });
};
