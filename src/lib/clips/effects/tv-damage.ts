/**
 * Captions with a bad signal.
 *
 * The look is an analogue one — a picture whose colour channels have come
 * apart, edges fringed red and cyan, the whole thing twitching. In an editor
 * like HitFilm it is a filter you drop on a layer; here it cannot be, because
 * the captions do not exist as a layer. They are burned by libass into the
 * finished picture in the same pass that produces the file, so there is no
 * moment at which the text is a thing an ffmpeg filter could be pointed at.
 * Giving it one would mean rendering the captions to their own transparent
 * video, filtering that, and compositing it back: a second full encode of every
 * frame, for a clip that currently pays for one.
 *
 * So it is drawn rather than filtered. A colour split is three copies of the
 * same words a few pixels apart, which is what the effect actually is, and ASS
 * will happily draw three copies. It costs nothing beyond two more lines in a
 * subtitle file. The twitch is the same trick over time: `\t` interpolates once
 * between two values and has no way to loop, so anything that jitters is a run
 * of short lines, each holding still for a frame or two.
 *
 * The offsets have to clear the caption's outline or the effect is invisible —
 * the first version of this looked like nothing at all, because the four pixels
 * of black border the captions carry for legibility covered the copies
 * completely. Hence copies draw with `\bord0`, and the default spread is wider
 * than the outline rather than prettier than it.
 */
import { assInlineColor, noise, ramp } from './types';
import type { CaptionCopy, CaptionEffect, EffectPack, PictureCss, PictureEffect } from './types';

/** How long one twitch holds. Shorter reads as noise, longer as a wobble. */
const STEP_SECONDS = 0.08;

/**
 * A ceiling on the slices, so a caption left up for a minute doesn't write
 * thousands of lines. Past this the step simply gets longer, which is slower
 * jitter rather than none.
 */
const MAX_STEPS = 160;

/** 0–100 solid, the way anyone would say it, to ASS's inverted alpha byte. */
const assAlpha = (strength: number) =>
  `\\alpha&H${Math.round((1 - Math.min(100, Math.max(0, strength)) / 100) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}&`;

const tvDamage: CaptionEffect = {
  id: 'tv-damage',
  label: 'TV damage',
  description: 'Colour channels pulled apart and twitching, like a bad signal.',
  params: [
    {
      key: 'spread',
      label: 'Split',
      type: 'number',
      default: 22,
      min: 2,
      max: 80,
      step: 1,
      hint: 'px'
    },
    {
      key: 'strength',
      label: 'Strength',
      type: 'number',
      default: 75,
      min: 10,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'lasting',
      label: 'Lasting',
      type: 'number',
      default: 0.3,
      min: 0.1,
      max: 10,
      step: 0.1,
      hint: 's'
    },
    { key: 'jitter', label: 'Twitch', type: 'toggle', default: true },
    { key: 'left', label: 'Left channel', type: 'color', default: '#ff3b3b' },
    { key: 'right', label: 'Right channel', type: 'color', default: '#35f5ff' }
  ],

  ass: ({ params, duration, seed, backdrop }) => {
    const spread = Number(params.spread);
    /*
     * It settles, rather than tearing for as long as the caption is up.
     *
     * Held for the whole line this stops being a fault and becomes a typeface:
     * the eye takes about a second to accept anything constant as simply how
     * this caption looks, and a caption that is permanently broken is one
     * nobody reads as broken. A third of a second and then clean text is a
     * signal recovering, which is what the effect is imitating — and the words
     * are legible for nearly all the time they are up, which matters more for a
     * caption than it does for a picture.
     *
     * Capped at the caption's own length, so a short line is damaged for all of
     * it rather than being promised a second it does not have.
     */
    const damage = Math.min(duration, Math.max(0.1, Number(params.lasting)));
    /*
     * A panel turns the effect inside out.
     *
     * The box is drawn in the same pass as the words — it is the style's
     * BorderStyle, not a thing of its own — so a copy underneath the caption is
     * a copy underneath an opaque rectangle, which is a copy nobody can see.
     * With a backdrop the copies go over the top instead, halved in strength on
     * the way: what was a fringe beside the letters becomes a wash across them,
     * and at full strength that is no longer text anyone can read.
     */
    const over = Boolean(backdrop);
    const layer = over ? 0 : undefined;
    const alpha = assAlpha(Number(params.strength) * (over ? 0.5 : 1));
    const flat = (hex: string) => `\\bord0\\shad0${alpha}\\1c${assInlineColor(String(hex))}`;
    const channels = [
      { tags: flat(String(params.left)), sign: -1, layer: over ? 1 : 0 },
      { tags: flat(String(params.right)), sign: 1, layer: over ? 2 : 1 }
    ];

    if (!params.jitter) {
      return {
        layer,
        copies: channels.map((c) => ({
          layer: c.layer,
          tags: c.tags,
          dx: c.sign * spread,
          from: 0,
          to: damage
        }))
      };
    }

    const step = Math.max(STEP_SECONDS, damage / MAX_STEPS);
    const copies: CaptionCopy[] = [];
    for (let i = 0; i * step < damage; i++) {
      const from = i * step;
      const to = Math.min(damage, from + step);
      for (const channel of channels) {
        /*
         * Mostly a small wander around the resting split, with the occasional
         * larger throw — an even jitter reads as a vibration, and it is the
         * irregular ones that read as a signal dropping out.
         */
        const wander = noise(seed + channel.layer, i);
        const throwOut = noise(seed + channel.layer + 7, i) > 0.88 ? 2.4 : 1;
        const dx = channel.sign * spread * (0.5 + wander * 0.9) * throwOut;
        copies.push({ layer: channel.layer, tags: channel.tags, dx: Math.round(dx), from, to });
      }
    }
    return { layer, copies };
  },

  css: ({ params, elapsed, duration, width, seed, backdrop }) => {
    const spread = Number(params.spread);
    const damage = Math.min(duration, Math.max(0.1, Number(params.lasting)));
    const opacity = Math.min(ramp(elapsed, 0.1), ramp(duration - elapsed, 0.2));
    const strength = ((Number(params.strength) / 100) * (backdrop ? 0.5 : 1)).toFixed(2);
    const step = Math.max(STEP_SECONDS, duration / MAX_STEPS);
    const frame = Math.floor(Math.max(0, elapsed) / step);

    /* Same sums as the render, at the one instant being drawn. */
    const shift = (sign: number, layer: number) => {
      if (!params.jitter) return sign * spread;
      const wander = noise(seed + layer, frame);
      const throwOut = noise(seed + layer + 7, frame) > 0.88 ? 2.4 : 1;
      return sign * spread * (0.5 + wander * 0.9) * throwOut;
    };

    /* Render pixels into a share of the frame, so the split is the same width
       of the picture in a 340px preview as in a 1080px render. */
    const cq = (px: number) => `${((px / width) * 100).toFixed(3)}cqw`;

    const copy = (hex: string, sign: number, layer: number) =>
      `opacity: ${(opacity * Number(strength)).toFixed(3)}; color: ${hex};` +
      ` text-shadow: none; transform: translateX(${cq(shift(sign, layer))})`;

    return {
      style: `opacity: ${opacity.toFixed(3)}`,
      // Once it has settled there is nothing underneath, the same as the render
      // once its copies have run out.
      copies:
        elapsed < damage
          ? [
              { style: copy(String(params.left), -1, 0), over: Boolean(backdrop) },
              { style: copy(String(params.right), 1, 1), over: Boolean(backdrop) }
            ]
          : []
    };
  }
};

const ghost: CaptionEffect = {
  id: 'ghost',
  label: 'Ghosting',
  description: 'A soft second image trailing to one side, like a weak aerial.',
  params: [
    {
      key: 'offset',
      label: 'Trails',
      type: 'number',
      default: 18,
      min: 2,
      max: 90,
      step: 2,
      hint: 'px'
    },
    {
      key: 'strength',
      label: 'Strength',
      type: 'number',
      default: 40,
      min: 5,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'softness',
      label: 'Softness',
      type: 'number',
      default: 6,
      min: 0,
      max: 40,
      step: 1,
      hint: 'px'
    }
  ],
  ass: ({ params, backdrop }) => {
    // Over the top when there is a panel to hide behind; see the note above.
    const over = Boolean(backdrop);
    return {
      layer: over ? 0 : undefined,
      copies: [
        {
          layer: over ? 1 : 0,
          tags:
            `\\bord0\\shad0${assAlpha(Number(params.strength) * (over ? 0.5 : 1))}` +
            `\\blur${Number(params.softness)}`,
          dx: Number(params.offset)
        }
      ]
    };
  },
  css: ({ params, elapsed, duration, width, color, backdrop }) => {
    const opacity = Math.min(ramp(elapsed, 0.1), ramp(duration - elapsed, 0.2));
    const cq = (px: number) => `${((px / width) * 100).toFixed(3)}cqw`;
    return {
      style: `opacity: ${opacity.toFixed(3)}`,
      copies: [
        {
          over: Boolean(backdrop),
          style:
            `opacity: ${(opacity * (Number(params.strength) / 100) * (backdrop ? 0.5 : 1)).toFixed(3)}; color: ${color};` +
            ` text-shadow: none; filter: blur(${cq(Number(params.softness))});` +
            ` transform: translateX(${cq(Number(params.offset))})`
        }
      ]
    };
  }
};

/**
 * The same idea, done to the picture instead of the words.
 *
 * The thing that separates damage from a filter is that damage is intermittent.
 * A chroma shift held for thirty seconds stops reading as a fault and starts
 * reading as a look — the eye takes about a second to accept anything constant
 * as simply how this footage is. So this is mostly clean, and tears for a tenth
 * of a second now and then, which is what a failing signal actually does.
 *
 * Bursts come from `enable`, which every filter here supports: an expression on
 * the clip's own clock deciding, per frame, whether the filter runs at all. It
 * costs nothing when it is off, and it is exact — the same clip tears at the
 * same moments every time it renders.
 *
 * Two periods rather than one, at a deliberately awkward ratio, so they drift
 * in and out of phase instead of ticking. A single period is a metronome, and a
 * fault that arrives exactly on the beat reads as an effect someone applied.
 */
const dropout: PictureEffect = {
  id: 'dropout',
  label: 'Signal loss',
  description: 'The picture tears for a moment.',
  /*
   * A moment, not a stretch.
   *
   * Held for two seconds this stops being a fault and becomes a look — the eye
   * accepts anything constant as simply how the footage is. Placed on the strip
   * it should be what it is: a flash on a beat, over before you have finished
   * seeing it. The rhythm dials below still apply when it is set across the
   * whole clip, where there is no block to say when.
   */
  shape: 'burst',
  seconds: 0.16,
  // A still of this is either an untouched frame or the worst one in the clip,
  // and neither is what it looks like.
  stillSafe: false,
  params: [
    {
      key: 'every',
      label: 'Every',
      type: 'number',
      default: 3.7,
      min: 0.5,
      max: 20,
      step: 0.1,
      hint: 's'
    },
    {
      key: 'length',
      label: 'Lasting',
      type: 'number',
      default: 0.14,
      min: 0.02,
      max: 1,
      step: 0.02,
      hint: 's'
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'number',
      default: 70,
      min: 10,
      max: 100,
      step: 5,
      hint: '%'
    }
  ],
  /*
   * The rhythm, stated on its own so the timeline can narrow it.
   *
   * Two periods at a deliberately awkward ratio, so they drift in and out of
   * phase instead of ticking. A single period is a metronome, and a fault that
   * lands exactly on the beat reads as an effect someone applied rather than as
   * something going wrong.
   *
   * Quoting is left to the caller, which combines this with whatever window the
   * effect was placed in and writes one `enable` from the two.
   */
  when: ({ params }) => {
    const every = Math.max(0.5, Number(params.every));
    const length = Math.max(0.02, Number(params.length));
    return (
      `lt(mod(t,${every.toFixed(2)}),${length.toFixed(2)})` +
      `+lt(mod(t,${(every * 1.43).toFixed(2)}),${(length * 0.65).toFixed(2)})`
    );
  },

  /**
   * Whether it is tearing at this instant.
   *
   * The same two periods `when` states as an ffmpeg expression, in the only
   * other language that has to agree with it. Written twice, once, in one file
   * — which is the whole reason both halves live on the same object: they can
   * be checked against each other by reading fifteen lines, and neither can be
   * changed without the other being right there.
   *
   * The window an effect was placed in is not consulted here. That belongs to
   * the timeline, which applies it before asking — exactly as the render
   * multiplies the two conditions together rather than making the effect know
   * about its own placement.
   */
  css: ({ params, at, width, windowed }) => {
    /*
     * Placed on the strip, the block is the event and the schedule is not
     * consulted — the same rule the render gates by, so the two agree about the
     * case that matters most: you dragged this onto a moment, so it happens at
     * that moment rather than wherever a rhythm would have put it.
     */
    if (!windowed) {
      const every = Math.max(0.5, Number(params.every));
      const length = Math.max(0.02, Number(params.length));
      const tearing = at % every < length || at % (every * 1.43) < length * 0.65;
      if (!tearing) return {};
    }

    const force = Math.min(100, Math.max(10, Number(params.severity))) / 100;
    return {
      filter: `saturate(${(1 - force * 0.6).toFixed(2)}) brightness(${(1 + force * 0.07).toFixed(2)})`,
      svg: {
        split: { r: (-force * 24) / width, b: (force * 24) / width }
      }
    } satisfies PictureCss;
  },

  filter: ({ params }) => {
    const force = Math.min(100, Math.max(10, Number(params.severity))) / 100;
    return [
      `chromashift=crh=${Math.round(force * 56)}:cbh=${-Math.round(force * 42)}:edge=smear`,
      `rgbashift=rh=${-Math.round(force * 24)}:bh=${Math.round(force * 24)}`,
      `noise=c0s=${Math.round(force * 90)}:c0f=t+u`,
      // Colour is the first thing a weak signal loses, and it comes back last.
      `eq=saturation=${(1 - force * 0.6).toFixed(2)}:brightness=${(force * 0.07).toFixed(2)}`
    ];
  }
};

export const tvDamagePack: EffectPack = {
  id: 'tv-damage',
  label: 'TV damage',
  captions: [tvDamage, ghost],
  picture: [dropout]
};
