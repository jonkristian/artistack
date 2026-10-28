/**
 * How one shot sits in the frame.
 *
 * The renderer worked this out in ffmpeg's language and the editor worked it
 * out again in CSS, which is two descriptions of one decision — and the kind
 * that disagrees quietly, where a preview shows a picture the file won't have.
 * The arithmetic lives here; each side only translates it.
 */

import type { ClipFill } from './types';

/**
 * How far a drifting window travels, as a fraction of the frame per second.
 *
 * Small on purpose. The point is that you notice the shot is alive without
 * ever catching it moving.
 *
 * One per cent a second: a four-second still travels a twenty-fifth of the
 * frame, a twenty-second hold about a fifth of it. Three per cent was the first
 * guess and read as a camera move rather than as breathing — slow enough to be
 * smooth, fast enough to watch, which is the wrong side of the line.
 *
 * A rate rather than a distance, so a long hold drifts further than a short one
 * instead of covering the same ground more slowly.
 */
export const DRIFT_PER_SECOND = 0.01;

/**
 * Where a drifting window sits at each end of a shot, 0 to 1 across the room
 * available to it.
 *
 * Returns null when there is nowhere to go: a picture the same shape as the
 * frame has no overflow, and a drift with no room would be a scale change
 * nobody asked for. The axis is chosen rather than offered — it is whichever
 * one the material actually has room on.
 */
export function driftWindow(
  room: { x: number; y: number },
  width: number,
  seconds: number
): { axis: 'x' | 'y'; from: number; to: number } | null {
  const axis = room.x >= room.y ? 'x' : 'y';
  const available = axis === 'x' ? room.x : room.y;
  if (available < 2) return null;

  // Never further than there is room for, and never faster than the rate.
  const travel = Math.min(available, DRIFT_PER_SECOND * seconds * width);
  const half = travel / available / 2;
  return { axis, from: 0.5 - half, to: 0.5 + half };
}

/** A quarter turn swaps which side of the footage is its width. */
export function turnedSize(
  source: { width: number; height: number },
  rotation?: number | null
): { width: number; height: number } {
  const quarter = Math.abs((((rotation ?? 0) % 360) + 360) % 360) % 180 === 90;
  return quarter
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/**
 * Whether the footage is already the shape of the frame.
 *
 * Phone video shot for this and a clip rendered at 9:16 are the same shape,
 * which is the common case, and a fill has nothing to do in it: there are no
 * bars to put anything in. Both sides need this, because both skip work on the
 * strength of it — the renderer skips a blur nobody would see, and the stage
 * skips a second copy of the video decoding behind the first.
 */
export function alreadyFills(
  frame: { width: number; height: number },
  source?: { width: number; height: number } | null,
  rotation?: number | null
): boolean {
  if (!source || source.width <= 0 || source.height <= 0) return false;
  const turned = turnedSize(source, rotation);
  const want = frame.width / frame.height;
  return Math.abs(turned.width / turned.height - want) / want < 0.01;
}

/**
 * What a shot's fill reduces to once the footage is known.
 *
 * `crop` is what a blur becomes when there is nothing to blur, and what `black`
 * becomes when there would be no bars — so there are only ever two pictures to
 * draw, not three.
 */
export function effectiveFill(
  fill: ClipFill,
  frame: { width: number; height: number },
  source?: { width: number; height: number } | null,
  rotation?: number | null
): 'crop' | 'black' | 'blur' {
  if (alreadyFills(frame, source, rotation)) return 'crop';
  return fill === 'black' ? 'black' : fill === 'crop' ? 'crop' : 'blur';
}

/**
 * Where the cropped window sits at a moment in the shot, 0 to 1 on each axis.
 *
 * Centred unless the shot drifts, which is the same answer the renderer writes
 * into its `crop` expression — the difference being that this one is asked
 * again every frame, and that one is written once and evaluated by ffmpeg.
 */
export function panAt(
  frame: { width: number; height: number },
  source: { width: number; height: number } | null | undefined,
  rotation: number | null | undefined,
  zoom: number,
  pan: boolean,
  seconds: number,
  at: number
): { x: number; y: number } {
  const middle = { x: 0.5, y: 0.5 };
  if (!pan || !source || source.width <= 0 || source.height <= 0) return middle;

  const turned = turnedSize(source, rotation);
  const scale = Math.max(
    (frame.width * zoom) / turned.width,
    (frame.height * zoom) / turned.height
  );
  const room = {
    x: turned.width * scale - frame.width,
    y: turned.height * scale - frame.height
  };

  const drift = driftWindow(room, frame.width, seconds);
  if (!drift) return middle;

  const through = Math.min(1, Math.max(0, at / Math.max(0.05, seconds)));
  const now = drift.from + (drift.to - drift.from) * through;
  return drift.axis === 'x' ? { x: now, y: 0.5 } : { x: 0.5, y: now };
}
