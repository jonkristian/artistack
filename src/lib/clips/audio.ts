/**
 * Where the beds sit, and how loud they are at a moment.
 *
 * The renderer worked this out in ffmpeg's language — `adelay`, `afade`,
 * `atrim` — and the editor had no answer at all: a bed was silent until a
 * render existed, which is a strange thing for the part of the clip you are
 * most likely to be timing something against. One set of rules now, read by
 * the filter graph and by the player.
 */

/** A bed as placed on the clip, with its ends already settled. */
export interface PlacedBed<T> {
  track: T;
  start: number;
  /** Where it stops: its own end, or the clip's, whichever comes first. */
  stop: number;
}

/**
 * The beds that actually sound, in the order they come in.
 *
 * Null means "until the clip does", and a value past the end means the same
 * thing — the clip is the outer bound either way. Anything left with nothing
 * between its ends is dropped rather than carried around as a silent input.
 */
export function placeBeds<T extends { start: number; end?: number | null }>(
  tracks: T[],
  totalDuration: number
): PlacedBed<T>[] {
  return tracks
    .map((track) => ({
      track,
      start: track.start,
      stop: Math.min(track.end ?? totalDuration, totalDuration)
    }))
    .filter((bed) => bed.stop > bed.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * How long a bed takes to arrive and to leave, and whether the curve is the
 * equal-power one.
 *
 * A crossfade is not something to specify — it's something already drawn. Where
 * one bed runs past where the next begins, the length of that overlap IS the
 * handover, so the outgoing one fades across exactly the stretch the incoming
 * one is rising through. Nobody has to describe it, and the two halves cannot
 * disagree about it.
 *
 * The toggles govern a bed's own edges. An overlap overrides them: two beds at
 * full is not a choice anyone makes, it's a clash.
 */
export function bedFades<T extends { fadeIn?: boolean | null; fadeOut?: boolean | null }>(
  placed: PlacedBed<T>[],
  index: number,
  base: number
): { in: number; out: number; crossIn: boolean; crossOut: boolean } {
  const bed = placed[index];
  const next = placed[index + 1];
  const previous = placed[index - 1];
  const overlapOut = next ? Math.max(0, bed.stop - next.start) : 0;
  const overlapIn = previous ? Math.max(0, previous.stop - bed.start) : 0;
  const span = Math.max(0, base);

  return {
    in: overlapIn > 0 ? overlapIn : bed.track.fadeIn ? span : 0,
    out: overlapOut > 0 ? overlapOut : bed.track.fadeOut ? span : 0,
    crossIn: overlapIn > 0,
    crossOut: overlapOut > 0
  };
}

/**
 * A bed's level at a moment, before ducking: 0 to 1.
 *
 * Equal-power through a handover, so the level holds flat across it instead of
 * dipping in the middle the way two linear ramps do — which is `curve=qsin` on
 * both sides of the same overlap, written here as the sine it is.
 */
export function bedLevel<T extends { fadeIn?: boolean | null; fadeOut?: boolean | null }>(
  placed: PlacedBed<T>[],
  index: number,
  base: number,
  at: number
): number {
  const bed = placed[index];
  if (at < bed.start || at >= bed.stop) return 0;

  const fades = bedFades(placed, index, base);
  const shape = (through: number, power: boolean) =>
    power
      ? Math.sin((Math.min(1, Math.max(0, through)) * Math.PI) / 2)
      : Math.min(1, Math.max(0, through));

  let level = 1;
  if (fades.in > 0) level = Math.min(level, shape((at - bed.start) / fades.in, fades.crossIn));
  if (fades.out > 0) level = Math.min(level, shape((bed.stop - at) / fades.out, fades.crossOut));
  return level;
}

/**
 * How far a ducked bed drops under footage that's making a sound.
 *
 * The render sidechains, which is a compressor reacting to the actual signal;
 * this is a number. It is the right *behaviour* — the bed gets out of the way
 * while something is being said over it — at the wrong precision, which is the
 * deal the whole live preview makes.
 */
export const DUCK_UNDER = 0.35;

/** How quickly the duck arrives and lets go, as a share of the gap per frame. */
export const DUCK_GLIDE = 0.12;
