/**
 * The ways a caption can arrive.
 *
 * Four entrances, nothing else — this pack is about the moment the words appear
 * and the moment they go, which is the part of a caption that reads as
 * deliberate or as an accident. A caption that simply blinks on looks like a
 * subtitle; one that lands looks like someone put it there.
 *
 * `fade` is what every caption has always done. It is in here as an effect
 * rather than as a special case so that "no effect" and "the old behaviour" are
 * the same thing said once, and so a clip made before any of this existed
 * renders byte-identically: the tags it emits are the `\fad(250,250)` that used
 * to be written into the Dialogue line by hand.
 */
import { easeOut, ramp } from './types';
import type { CaptionEffect, EffectPack } from './types';

/** Both halves agree on this, so an entrance can't be quick here and slow there. */
const OUT_MS = 200;

/** ASS counts milliseconds, CSS counts seconds, and `duration` is seconds. */
const secs = (ms: number) => ms / 1000;

/**
 * The exit, shared.
 *
 * Every entrance fades out the same way — an effect that arrives with a bang
 * and leaves with one draws attention to the leaving, which is never where it
 * is wanted. So the exit is written once here instead of being a dial on four
 * effects.
 */
const fadeOut = (elapsed: number, duration: number) => ramp(duration - elapsed, secs(OUT_MS));

const fade: CaptionEffect = {
  id: 'fade',
  label: 'Fade',
  description: 'Up and away again. What captions have always done.',
  params: [
    {
      key: 'in',
      label: 'Fade in',
      type: 'number',
      default: 250,
      min: 0,
      max: 1500,
      step: 50,
      hint: 'ms'
    },
    {
      key: 'out',
      label: 'Fade out',
      type: 'number',
      default: 250,
      min: 0,
      max: 1500,
      step: 50,
      hint: 'ms'
    }
  ],
  ass: ({ params }) => ({ tags: `\\fad(${Number(params.in)},${Number(params.out)})` }),
  css: ({ params, elapsed, duration }) => {
    const opacity = Math.min(
      ramp(elapsed, secs(Number(params.in))),
      ramp(duration - elapsed, secs(Number(params.out)))
    );
    return { style: `opacity: ${opacity.toFixed(3)}` };
  }
};

const pop: CaptionEffect = {
  id: 'pop',
  label: 'Pop',
  description: 'Springs up to size. Good over a cut.',
  params: [
    {
      key: 'from',
      label: 'Starts at',
      type: 'number',
      default: 55,
      min: 10,
      max: 99,
      step: 5,
      hint: '%'
    },
    {
      key: 'ms',
      label: 'Takes',
      type: 'number',
      default: 220,
      min: 80,
      max: 900,
      step: 20,
      hint: 'ms'
    }
  ],
  ass: ({ params }) => {
    const from = Number(params.from);
    const ms = Number(params.ms);
    return {
      tags: `\\fad(100,${OUT_MS})\\fscx${from}\\fscy${from}` + `\\t(0,${ms},\\fscx100\\fscy100)`
    };
  },
  css: ({ params, elapsed, duration }) => {
    const from = Number(params.from) / 100;
    const grown = from + (1 - from) * easeOut(elapsed, secs(Number(params.ms)));
    const opacity = Math.min(ramp(elapsed, 0.1), fadeOut(elapsed, duration));
    return { style: `opacity: ${opacity.toFixed(3)}; transform: scale(${grown.toFixed(3)})` };
  }
};

const rise: CaptionEffect = {
  id: 'rise',
  label: 'Rise',
  description: 'Slides up into place from just below.',
  params: [
    {
      key: 'distance',
      label: 'Rises',
      type: 'number',
      default: 60,
      min: 10,
      max: 300,
      step: 10,
      hint: 'px'
    },
    {
      key: 'ms',
      label: 'Takes',
      type: 'number',
      default: 300,
      min: 80,
      max: 900,
      step: 20,
      hint: 'ms'
    }
  ],
  /*
   * `\move` rather than a transform, because ASS has nothing that shifts text
   * relative to where it already is. Absolute coordinates are safe here: `\an2`
   * anchors the block bottom-centre, so x is simply the middle of the frame,
   * and libass goes on wrapping to the style's margins exactly as it does
   * without a `\move` — checked, because it would have been a reasonable guess
   * that positioning a line opts it out of them.
   */
  ass: ({ params, width, y }) => {
    const distance = Number(params.distance);
    const ms = Number(params.ms);
    const x = Math.round(width / 2);
    return {
      tags: `\\fad(120,${OUT_MS})\\move(${x},${Math.round(y + distance)},${x},${Math.round(y)},0,${ms})`
    };
  },
  css: ({ params, elapsed, duration, height }) => {
    const left = 1 - easeOut(elapsed, secs(Number(params.ms)));
    const offset = (Number(params.distance) / height) * 100 * left;
    const opacity = Math.min(ramp(elapsed, 0.12), fadeOut(elapsed, duration));
    return {
      style: `opacity: ${opacity.toFixed(3)}; transform: translateY(${offset.toFixed(2)}cqh)`
    };
  }
};

const blur: CaptionEffect = {
  id: 'blur',
  label: 'Focus',
  description: 'Comes in soft and sharpens up.',
  params: [
    {
      key: 'amount',
      label: 'Softness',
      type: 'number',
      default: 14,
      min: 2,
      max: 60,
      step: 2,
      hint: 'px'
    },
    {
      key: 'ms',
      label: 'Takes',
      type: 'number',
      default: 320,
      min: 80,
      max: 1200,
      step: 20,
      hint: 'ms'
    }
  ],
  ass: ({ params }) => {
    const amount = Number(params.amount);
    const ms = Number(params.ms);
    return { tags: `\\fad(80,${OUT_MS})\\blur${amount}\\t(0,${ms},\\blur0)` };
  },
  css: ({ params, elapsed, duration, width }) => {
    const left = 1 - easeOut(elapsed, secs(Number(params.ms)));
    /*
     * The dial is render pixels, and the preview is a third the size — so it is
     * turned into a share of the frame's width and handed over in `cqw`, the
     * same trick the overlay already uses for the caption margins. A blur in
     * raw pixels would be three times too strong in the browser.
     */
    const soft = (Number(params.amount) / width) * 100 * left;
    const opacity = Math.min(ramp(elapsed, 0.12), fadeOut(elapsed, duration));
    return { style: `opacity: ${opacity.toFixed(3)}; filter: blur(${soft.toFixed(3)}cqw)` };
  }
};

export const basics: EffectPack = {
  id: 'basics',
  label: 'Entrances',
  captions: [fade, pop, rise, blur]
};
