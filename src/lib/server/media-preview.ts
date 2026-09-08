import { rename, stat, unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { media } from './schema';
import { UPLOAD_DIR, mediaPath } from './paths';
import { hasBinary, runFfmpeg } from './ffmpeg';

/**
 * A small copy of an uploaded video, for playing in the editor.
 *
 * Phone footage is routinely 4K. The trim player loads it whole to scrub three
 * seconds of it, and the live preview will want two of them decoding at once
 * across a cut — which a laptop will not do smoothly. A few hundred kilobytes
 * of the same footage plays instantly and is indistinguishable for the job it's
 * being used for, which is deciding where things go.
 *
 * Not the render's input, ever. That gets the footage as shot.
 */

/**
 * Long edge of the preview.
 *
 * Sized against the pane it plays in, not against the footage: the editor's
 * video is a few hundred pixels across, and 720 was most of a phone screen's
 * worth of detail being decoded to fill a third of a laptop's. 540 still has
 * more pixels than the element on an ordinary display, and roughly half the
 * work of the old one.
 *
 * Anything already made keeps its size until the file is replaced. There is
 * nothing to gain from re-making them.
 */
const PREVIEW_EDGE = 540;

/*
 * One at a time.
 *
 * Uploading five clips at once would otherwise start five transcodes at once
 * and take the machine away from the thing the person is actually waiting for —
 * which, on a box that also renders, might be a render.
 */
let running = false;
const waiting: number[] = [];

/**
 * Makes a preview for a media row, eventually.
 *
 * Deliberately not awaited by its callers: the upload has already been answered
 * and the row already exists. Everything reading a preview falls back to the
 * original, so the only difference between "not made yet" and "never made" is
 * how long the fallback lasts.
 */
export function queuePreviewRendition(mediaId: number): void {
  if (!waiting.includes(mediaId)) waiting.push(mediaId);
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;

  try {
    for (;;) {
      const next = waiting.shift();
      if (next === undefined) return;
      await makePreview(next).catch((e) => {
        // A missing preview costs a slower player, nothing else.
        console.error(`[Preview] Could not make one for media ${next}:`, e);
      });
    }
  } finally {
    running = false;
  }
}

async function makePreview(mediaId: number): Promise<void> {
  if (!(await hasBinary('ffmpeg'))) return;

  const [item] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!item?.url || !item.mimeType?.startsWith('video/')) return;
  // A render or a proof is already the size it wants to be.
  if (item.role === 'render' || item.role === 'proof') return;
  if (item.previewUrl) return;

  const source = mediaPath(item.url);
  const stem = basename(source, extname(source));
  const name = `${stem}-preview.mp4`;

  /*
   * Written under a temporary name and moved into place, so a restart halfway
   * through can't leave a half-file that looks finished to everything reading
   * the column.
   */
  const temp = join(UPLOAD_DIR, `.${name}.part`);
  const destination = join(UPLOAD_DIR, name);

  await runFfmpeg([
    '-y',
    '-loglevel',
    'error',
    '-i',
    source,
    '-vf',
    // Long edge to PREVIEW_EDGE, short edge to match, both even. `force_original
    // _aspect_ratio=decrease` against a square box does this for either
    // orientation without having to know which one this is.
    `scale=${PREVIEW_EDGE}:${PREVIEW_EDGE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    // Seekable without a network round trip per scrub.
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '2',
    /*
     * Said outright, because the temporary name ends in `.part` and ffmpeg
     * picks its muxer from the extension. Without this every preview failed at
     * the first frame with "unable to choose an output format" — silently, into
     * the log, since nothing waits for one and every reader falls back to the
     * original. No preview has ever been made.
     */
    '-f',
    'mp4',
    temp
  ]);

  await rename(temp, destination);
  const size = (await stat(destination)).size;

  await db
    .update(media)
    .set({ previewUrl: `/uploads/${name}` })
    .where(eq(media.id, mediaId));

  console.log(`[Preview] media ${mediaId}: ${Math.round(size / 1024)}KB`);
}

/** Removes a preview, for when its source is deleted or replaced. */
export async function removePreview(previewUrl: string | null | undefined): Promise<void> {
  if (!previewUrl) return;
  await unlink(mediaPath(previewUrl)).catch(() => {});
}
