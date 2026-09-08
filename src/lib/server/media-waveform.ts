import { rename, unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { media } from './schema';
import { UPLOAD_DIR, mediaPath } from './paths';
import { hasBinary, runFfmpeg } from './ffmpeg';

/**
 * A picture of a song, for placing it against footage.
 *
 * Lining a bed up to a beat — or to the camera's own audio, so a better
 * recording sits under the take it belongs to — is the hardest thing in the
 * editor, and until now it was done by ear: press play, listen, guess, nudge,
 * listen again. A waveform turns that into something you can see, which is the
 * difference between hunting for the downbeat and pointing at it.
 *
 * One image per file, not per placement. The whole song at a fixed width, so a
 * block showing thirty seconds of it scales and offsets the same picture rather
 * than asking for a new one every time an edge moves.
 */

/**
 * How wide the picture is drawn, per second of audio.
 *
 * Not a fixed width. Every file used to be 2000 pixels whatever its length, so
 * a three-minute track carried eleven pixels a second and a five-minute one
 * under seven — and since both are then stretched to the same scale on the
 * strip, the longer one was stretched half as hard again. Thicker strokes,
 * denser shape, heavier-looking: two files at matched levels still reading as
 * different pictures.
 *
 * Proportional, so the stretch is identical for every file and the only thing
 * left that can differ is the sound.
 */
const WAVE_PX_PER_SECOND = 12;
const WAVE_MIN_WIDTH = 800;
const WAVE_MAX_WIDTH = 6000;
const WAVE_HEIGHT = 64;

/**
 * The level every picture is drawn at, whatever the file's own level is.
 *
 * Two beds in the same clip were arriving eighteen decibels apart in average
 * level — a mastered track and a rough mix — and drew as a full waveform beside
 * a hairline. That difference is real, and it is also not what this picture is
 * for: the shape is here to be lined up against a cut, and a shape you cannot
 * see is no use for that. The mix decides how loud they actually play.
 *
 * Mean rather than peak, because peak barely differed between those two and the
 * mean is what the eye reads as loudness.
 */
const WAVE_TARGET_DB = -14;

/** Suffix, so a change to how these are drawn can replace what's already there. */
const WAVE_SUFFIX = '-wave3.png';

/**
 * Whether a stored waveform was drawn by the current version.
 *
 * Exported because the thing that decides to ask for one is elsewhere, and
 * "has it got a picture" is not the same question as "has it got this
 * picture" — asking the first is how a redraw silently never happens.
 */
export function waveformIsCurrent(url: string | null | undefined): boolean {
  return Boolean(url?.endsWith(WAVE_SUFFIX));
}

/*
 * One at a time, for the same reason previews are: a picking of five tracks
 * shouldn't take the machine away from a render.
 */
let running = false;
const waiting: number[] = [];

/**
 * Makes a waveform for a media row, eventually.
 *
 * Not awaited by its callers. The timeline draws nothing when there isn't one,
 * which is also what it does for a file that will never get one, so "not yet"
 * and "never" need no distinguishing.
 */
export function queueWaveform(mediaId: number): void {
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
      await makeWaveform(next).catch((e) => {
        // A missing waveform costs a harder edit, nothing else.
        console.error(`[Waveform] Could not draw one for media ${next}:`, e);
      });
    }
  } finally {
    running = false;
  }
}

async function makeWaveform(mediaId: number): Promise<void> {
  if (!(await hasBinary('ffmpeg'))) return;

  const [item] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!item?.url || !item.mimeType?.startsWith('audio/')) return;
  // Anything drawn by an older version is replaced rather than kept.
  if (waveformIsCurrent(item.waveformUrl)) return;
  const previous = item.waveformUrl;

  const source = mediaPath(item.url);
  const stem = basename(source, extname(source));
  const name = `${stem}${WAVE_SUFFIX}`;

  /*
   * How far this file is from the level everything is drawn at.
   *
   * `-vn`, because the picture is beside the point here — without it ffmpeg
   * decodes and re-encodes the video stream to measure the sound.
   */
  const width = Math.round(
    Math.min(
      WAVE_MAX_WIDTH,
      Math.max(WAVE_MIN_WIDTH, ((item.durationMs ?? 0) / 1000) * WAVE_PX_PER_SECOND)
    )
  );

  let gain = 0;
  const measured = await runFfmpeg([
    '-loglevel',
    'info',
    '-i',
    source,
    '-vn',
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-'
  ]).catch(() => '');
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(measured);
  if (mean) {
    // Never turned down, and never lifted so far that noise becomes the picture.
    gain = Math.max(0, Math.min(24, WAVE_TARGET_DB - Number(mean[1])));
  }

  // Written aside and moved into place, so a restart can't leave half a picture
  // that looks finished to everything reading the column.
  const temp = join(UPLOAD_DIR, `.${name}.part`);
  const destination = join(UPLOAD_DIR, name);

  await runFfmpeg([
    '-y',
    '-loglevel',
    'error',
    '-i',
    source,
    '-filter_complex',
    /*
     * `sqrt` rather than the linear default.
     *
     * Music mastered with any headroom at all draws as a thin band across the
     * middle at linear scale — technically accurate, and useless at 26 pixels
     * tall, which is what a bed's block is. The square root opens the quiet
     * part up so the shape fills the height while the loud/quiet difference is
     * still legible. `cbrt` goes further and flattens everything into a slab.
     *
     * White on transparent: the block tints it by sitting behind it, so one
     * picture works whatever colour the lane ends up.
     */
    `aformat=channel_layouts=mono` +
      // Lifted to the common level, then limited: without it a quiet file's
      // peaks square off into a solid band on the way up.
      (gain > 0.5 ? `,volume=${gain.toFixed(1)}dB,alimiter=limit=0.95` : '') +
      `,showwavespic=s=${width}x${WAVE_HEIGHT}:colors=white:scale=sqrt`,
    '-frames:v',
    '1',
    /*
     * Said outright, because the temporary name ends in `.part` and ffmpeg
     * picks its muxer from the extension. Without this it refuses the file
     * ("unable to choose an output format"), and with only `-f image2` it
     * writes a JPEG — image2's default codec, not what the name promises.
     */
    '-f',
    'image2',
    '-c:v',
    'png',
    temp
  ]);

  await rename(temp, destination);

  await db
    .update(media)
    .set({ waveformUrl: `/uploads/${name}` })
    .where(eq(media.id, mediaId));

  // The one it replaces, now that nothing points at it.
  if (previous && previous !== `/uploads/${name}`) await removeWaveform(previous);
}

/** Removes a waveform, for when its source is deleted or replaced. */
export async function removeWaveform(waveformUrl: string | null | undefined): Promise<void> {
  if (!waveformUrl) return;
  await unlink(mediaPath(waveformUrl)).catch(() => {});
}
