/**
 * The geometry of the timeline's contact sheet, shared by the endpoint that
 * generates it and the component that lies it down.
 *
 * These have to agree or the strip lies. The sheet is drawn stretched across
 * the timeline's full width, so if the endpoint samples a different number of
 * frames than the component's width implies, every frame is squeezed or pulled
 * — and a frame that isn't its own shape is worse than no frame, because it
 * still looks like a picture of the clip.
 */

/**
 * Bumped whenever the sampling below changes shape.
 *
 * Sheets are cached on disk against the render they came from, and that key is
 * otherwise permanent — so without this, changing how the strip is cut would
 * leave every existing clip showing frames laid out to the old rules, silently
 * and forever.
 */
export const STRIP_VERSION = 4;

/**
 * How much taller than its drawn size each frame is cut.
 *
 * Sharpness on a dense display, traded against the sheet's width ceiling: at
 * 2× a long clip hit the ceiling and had its frames stretched to twice their
 * true shape, which is a worse picture than a slightly soft one.
 */
export const FRAME_SCALE = 1.5;

/** The strip's height on screen, in CSS pixels. Matches `h-32`. */
export const STRIP_HEIGHT = 128;

/**
 * How much width one second of clip gets.
 *
 * Fitting the whole clip to the column was the first attempt and it collapsed:
 * a caption a second long came out a few pixels wide, with nothing to grab and
 * nothing to read. A fixed rate means a second is the same distance in every
 * clip, the blocks keep a workable size, and long clips scroll — which is what
 * every editor that has solved this does.
 */
export const STRIP_PX_PER_SECOND = 170;

/**
 * Upper bound on frames in one sheet.
 *
 * A minute at this rate would otherwise want a sheet some fourteen thousand
 * pixels wide, which browsers decline to draw as a background at all on some
 * hardware. Past the cap the frames stretch rather than the strip lying about
 * where anything is — the timings stay exact, the pictures get looser.
 */
const MIN_COLUMNS = 8;

/**
 * How wide a sheet may get, in pixels.
 *
 * Not a frame count, because a frame's width comes from the clip's shape: the
 * same 72 frames is a modest sheet for a tall clip and an enormous one for a
 * wide one. Browsers stop drawing very large images as backgrounds, and where
 * exactly depends on the hardware, so the ceiling belongs on the thing that
 * actually breaks.
 */
const MAX_SHEET_WIDTH = 7800;

/**
 * How many frames the sheet needs so each one lands at its own aspect ratio.
 *
 * A frame is drawn `STRIP_HEIGHT` tall, so it wants to be `height × aspect`
 * wide; the strip is `duration × STRIP_PX_PER_SECOND` wide in total. Dividing
 * one by the other is the frame count that makes those two agree.
 */
export function stripColumns(durationSeconds: number, aspect: number): number {
  const frameWidth = Math.max(STRIP_HEIGHT * aspect, 1);
  const wanted = Math.round((durationSeconds * STRIP_PX_PER_SECOND) / frameWidth);

  // Past this the frames stretch rather than the sheet growing: the timings
  // stay exact, the pictures get looser.
  const ceiling = Math.max(
    MIN_COLUMNS,
    Math.floor(MAX_SHEET_WIDTH / Math.max(FRAME_HEIGHT * aspect, 1))
  );

  return Math.min(ceiling, Math.max(MIN_COLUMNS, wanted));
}

/** The height each frame is cut at, in pixels. */
export const FRAME_HEIGHT = STRIP_HEIGHT * FRAME_SCALE;
