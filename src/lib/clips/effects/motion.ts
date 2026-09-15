/**
 * Moves on the frame itself, rather than on what is in it.
 *
 * The other packs change how the picture looks; these change where it is
 * pointed. A slow push into a photograph is the oldest trick in the documentary
 * book and the reason a still can hold a screen at all — a picture that sits
 * perfectly still for four seconds reads as a stall, and the same picture
 * drifting a few per cent reads as a shot.
 *
 * Useful on footage too, but stills are why it exists: everything else on the
 * picture lane already moves by itself.
 *
 * **Why not `zoompan`.** It is the filter named for this job and it is the
 * wrong one here: it generates frames rather than transforming them, so its
 * output length stops being the input's and it cannot simply sit in a chain.
 * `scale` with `eval=frame` re-reads its expressions every frame and stays an
 * ordinary link, which is all a move needs.
 *
 * **Why these are not gated.** Every other effect is switched on and off with
 * `enable=` over its window. A move cannot be: switched off, it does not stop
 * where it got to, it vanishes — the pan you placed across a chorus snapped
 * back to the opening framing the frame the chorus ended. So these are
 * `selfTimed` and the window lives inside the expressions, where `clip(…,0,1)`
 * holds the opening framing before the move and the closing one after it.
 *
 * **How a move is expressed.** The picture is scaled up over time and a
 * frame-sized window is cropped back out of it.
 *
 * **Panning is not here, and cannot be.** These run on the finished picture,
 * long after `buildFill` cropped away everything outside the frame — so a pan
 * at this stage would have to invent its own zoom to make room, which is a
 * different and worse thing than moving across material that exists. Drifting
 * belongs to the shot, where the picture is still whole: see `clip_sources.pan`
 * and `buildFill`.
 */
import type { EffectPack, PictureCss, PictureEffect, PictureEffectContext } from './types';

/** Sane bounds for a dial that reads as a percentage. */
const STRENGTH = {
  key: 'strength',
  label: 'Amount',
  type: 'number' as const,
  default: 18,
  min: 2,
  max: 60,
  step: 2,
  hint: '%'
};

/**
 * Off by default, and that is not a taste decision.
 *
 * A cubic ease-out ends at zero velocity. Over a slow move that means the last
 * half-second travels a fraction of a pixel per frame — and a scaler works in
 * whole pixels, so the picture freezes, jumps two, freezes. Measured on a
 * two-second push: twelve of fifty-nine frames identical to the one before,
 * every one of them in the final quarter. Linear over the same move stalls on
 * none and is five times steadier frame to frame.
 *
 * Left available because it is right for a short, large move — a half-second
 * punch in has the pixels per frame to spare, and settling looks better than
 * stopping. It is wrong for the drift a still usually wants, which is what the
 * default now says.
 */
const EASE = {
  key: 'ease',
  label: 'Ease out',
  type: 'toggle' as const,
  default: false,
  hint: 'short moves only'
};

/**
 * How far through the move we are, 0 to 1.
 *
 * Written twice on purpose — once as an ffmpeg expression and once as a number
 * — because the two are asked different questions. ffmpeg is handed the whole
 * life of the move in one string and evaluates it per frame; the browser is
 * handed one instant and asked what it looks like. Same curve either way, which
 * is the only thing that matters.
 */
function progressExpr(start: number, end: number, ease: boolean): string {
  const span = Math.max(0.05, end - start);
  const linear = `clip((t-${start.toFixed(3)})/${span.toFixed(3)},0,1)`;
  // See EASE: the cubic tail is sub-pixel and judders. Linear is a constant
  // velocity, which is also what a camera on a slider actually does.
  return ease ? `(1-pow(1-${linear},3))` : linear;
}

function progressAt(at: number, start: number, end: number, ease: boolean): number {
  const span = Math.max(0.05, end - start);
  const linear = Math.min(1, Math.max(0, (at - start) / span));
  return ease ? 1 - (1 - linear) ** 3 : linear;
}

/** A move, as the two numbers that describe it at any instant. */
interface Move {
  /** Scale at the start and at the end. */
  zoom: [number, number];
  /**
   * Where the window sits inside the oversized picture, 0 to 1 on each axis,
   * at the start and at the end. 0.5 is centred.
   */
  x: [number, number];
  y: [number, number];
}

/**
 * The filters for a move.
 *
 * `scale` grows the picture by the zoom of the moment, `crop` takes a window
 * out of it, and a final `scale` puts it back to frame size. All three read
 * `t`, so this is the whole animation with no state carried between frames.
 *
 * Two things here are the difference between a move and a stutter, and both
 * were learned the hard way:
 *
 * **The sizes are not rounded.** They used to be forced even, on the theory
 * that an odd intermediate would fail at the encoder. It does not — the crop
 * normalises to even long before anything is encoded. What rounding did do was
 * quantise width and height *independently*, so they crossed their thresholds
 * on different frames and the picture lurched sideways on one and downwards on
 * the next. Measured on a centred push: 49 frames moving on both axes, 48 on
 * one, 124 on the other and 108 not at all. A centred zoom should never move
 * sideways at all.
 *
 * **The window is cropped at twice the size.** `crop` takes whole pixels, so a
 * slow move advances one and then none. Done at 2x and scaled back down, each
 * of those steps is half an output pixel and the downscale turns the remainder
 * into interpolation. It is the same answer given for `zoompan`'s jitter, which
 * has the same cause.
 */
function moveFilters(ctx: PictureEffectContext, move: Move): string[] {
  const ease = Boolean(ctx.params.ease);
  const p = progressExpr(ctx.window.start, ctx.window.end, ease);
  const [z0, z1] = move.zoom;
  const z = z0 === z1 ? z0.toFixed(4) : `max(1,${z0.toFixed(4)}+(${(z1 - z0).toFixed(4)})*${p})`;

  const OVER = 2;
  const cw = ctx.width * OVER;
  const ch = ctx.height * OVER;
  // Written out rather than read back as iw/ih: `crop` evaluates those once,
  // and a scale that changes every frame makes them a lie after the first.
  const sw = `(${cw}*${z})`;
  const sh = `(${ch}*${z})`;

  const axis = ([a, b]: [number, number], size: string, out: number) => {
    const at = a === b ? a.toFixed(4) : `(${a.toFixed(4)}+(${(b - a).toFixed(4)})*${p})`;
    return `(${size}-${out})*${at}`;
  };

  return [
    `scale=w='${sw}':h='${sh}':eval=frame`,
    `crop=${cw}:${ch}:'${axis(move.x, sw, cw)}':'${axis(move.y, sh, ch)}'`,
    `scale=${ctx.width}:${ctx.height}`
  ];
}

/**
 * The same move as a CSS transform, for the editor.
 *
 * Stated `translate` then `scale`, and the order is the whole of it. CSS
 * composes transforms right to left, so the rightmost is applied to the element
 * first: written the other way round the shift happens before the scale and is
 * then magnified by it, overshooting by exactly the zoom factor. At 18% that
 * pushed the picture 69px left where 58 was wanted, and the right-hand edge
 * came away from the frame.
 *
 * Written this way the element is scaled about its centre first, then moved by
 * a percentage of its own unscaled width — which is what the maths below
 * assumes, and what makes it agree with the crop above to the pixel.
 */
function moveCss(ctx: PictureEffectContext & { at: number }, move: Move): PictureCss {
  const ease = Boolean(ctx.params.ease);
  const p = progressAt(ctx.at, ctx.window.start, ctx.window.end, ease);
  const lerp = ([a, b]: [number, number]) => a + (b - a) * p;

  const z = lerp(move.zoom);
  const overflow = ((z - 1) / 2) * 100;
  const dx = (0.5 - lerp(move.x)) * 2 * overflow;
  const dy = (0.5 - lerp(move.y)) * 2 * overflow;

  return { transform: `translate(${dx.toFixed(3)}%, ${dy.toFixed(3)}%) scale(${z.toFixed(4)})` };
}

/** Turns one `Move` into a whole effect, since the six differ only in that. */
function movement(
  id: string,
  label: string,
  description: string,
  of: (strength: number) => Move
): PictureEffect {
  const move = (ctx: PictureEffectContext) => of(Number(ctx.params.strength) / 100);
  return {
    id,
    label,
    description,
    /*
     * A single frame cannot show a move, and a still of one would be a lie
     * about which end you were looking at — so these are left out of the
     * swatches rather than misrepresented by them, exactly as the signal
     * dropout is.
     */
    stillSafe: false,
    shape: 'span',
    /*
     * The window is in the expressions, not around them. `clip(...,0,1)` holds
     * at the opening framing before the move and at the closing one after it,
     * so the picture is continuous either side — where an `enable` gate would
     * have dropped it back to untouched the frame the window ended.
     */
    selfTimed: true,
    params: [STRENGTH, EASE],
    filter: (ctx) => moveFilters(ctx, move(ctx)),
    css: (ctx) => moveCss(ctx, move(ctx))
  };
}

export const motion: EffectPack = {
  id: 'motion',
  label: 'Moves',
  picture: [
    movement('push-in', 'Push in', 'A slow move towards the middle of the picture.', (s) => ({
      zoom: [1, 1 + s],
      x: [0.5, 0.5],
      y: [0.5, 0.5]
    })),
    movement('pull-out', 'Pull out', 'Starts close and opens out to the full frame.', (s) => ({
      zoom: [1 + s, 1],
      x: [0.5, 0.5],
      y: [0.5, 0.5]
    }))
  ]
};
