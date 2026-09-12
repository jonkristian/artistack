/**
 * Two looks that are only colour.
 *
 * The other pack imitates a process — a tape, a reel, a tube — and earns its
 * name from the machine. These earn theirs from a decision: make it warmer and
 * harder, or take the colour out. Nothing has happened to the signal, so there
 * is no noise, no bleed and no lost resolution; a grade is what a camera was
 * pointed at, not what the picture went through afterwards.
 *
 * They exist because the presets needed them. Clean, Punchy, Cinematic and
 * Documentary each used to build their own picture out of `tone`, `grain` and
 * `vignette` — the same ingredients the effects use, mixed separately, so a
 * preset and an effect together gave two vignettes and two lots of grain. A
 * preset naming one of these owns the look in one piece instead.
 *
 * Both are entirely YUV, so neither costs ffmpeg a conversion to RGB and back.
 * See the note in `vhs.ts`: that round trip was two thirds of what the camcorder
 * look cost before it was taken out.
 */
import type { EffectPack, PictureCss, PictureEffect } from './types';

const n = (value: number) => Number(value.toFixed(2));

/**
 * A warm cast as chroma offsets, and the same shift in the colours a browser
 * works in. One number, both halves derived from it — the arrangement the
 * camcorder's cold cast already uses, for the same reason.
 */
const warmCast = (warmth: number) => ({ u: -warmth * 10, v: warmth * 12 });
const castRgb = ({ u, v }: { u: number; v: number }) => ({
  r: (1.402 * v) / 255,
  g: (-0.344 * u - 0.714 * v) / 255,
  b: (1.772 * u) / 255
});

const punch: PictureEffect = {
  id: 'punch',
  label: 'Punch',
  description: 'Warm and contrasty, with the corners pulled down.',
  stillSafe: true,
  params: [
    {
      key: 'warmth',
      label: 'Warmth',
      type: 'number',
      default: 45,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'number',
      default: 112,
      min: 90,
      max: 150,
      step: 2,
      hint: '%'
    },
    {
      key: 'vignette',
      label: 'Vignette',
      type: 'number',
      default: 55,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    }
  ],
  filter: ({ params }) => {
    const cast = warmCast(Number(params.warmth) / 100);
    const vignette = Number(params.vignette) / 100;
    const filters = [
      `eq=contrast=${n(Number(params.contrast) / 100)}:saturation=1.1`,
      `lutyuv=u='clip(val${Math.round(cast.u)},0,255)':v='clip(val+${Math.round(cast.v)},0,255)'`
    ];
    /* A wider angle is a gentler corner, so the dial runs the other way. */
    if (vignette > 0) filters.push(`vignette=PI/${n(6.5 - vignette * 2.5)}`);
    return filters;
  },
  css: ({ params }) => {
    const rgb = castRgb(warmCast(Number(params.warmth) / 100));
    return {
      filter: `contrast(${n(Number(params.contrast) / 100)}) saturate(1.1)`,
      svg: {
        curves: {
          r: [n(rgb.r), n(1 + rgb.r)],
          g: [n(rgb.g), n(1 + rgb.g)],
          b: [n(rgb.b), n(1 + rgb.b)]
        }
      },
      /* A vignette is a shape rather than a filter, so the browser draws it as
         one — which it can do exactly, unlike the grain it leaves out. */
      overlay:
        Number(params.vignette) > 0
          ? [
              {
                background:
                  'radial-gradient(ellipse at center,' +
                  ` transparent 45%, rgb(0 0 0 / ${n((Number(params.vignette) / 100) * 0.55)}) 100%)`
              }
            ]
          : undefined
    } satisfies PictureCss;
  }
};

const mono: PictureEffect = {
  id: 'mono',
  label: 'Black and white',
  description: 'The colour taken out, and the contrast put back.',
  stillSafe: true,
  params: [
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'number',
      default: 108,
      min: 90,
      max: 150,
      step: 2,
      hint: '%'
    },
    { key: 'grain', label: 'Grain', type: 'number', default: 0, min: 0, max: 60, step: 2 }
  ],
  filter: ({ params }) => {
    /* `hue=s=0` rather than a saturation of zero in `eq`: it is the one the
       clip's `tone: 'bw'` has always used, so a project converted from that
       setting to this effect comes out looking the same. */
    const filters = ['hue=s=0', `eq=contrast=${n(Number(params.contrast) / 100)}`];
    const grain = Math.round(Number(params.grain));
    if (grain > 0) filters.push(`noise=c0s=${grain}:c0f=t+u`);
    return filters;
  },
  css: ({ params }) => ({
    filter: `grayscale(1) contrast(${n(Number(params.contrast) / 100)})`
  })
};

/**
 * The same cast the other way.
 *
 * `warmCast` with a negative argument rather than numbers of its own: warm and
 * cool are one axis, and two sets of constants for one axis is how they end up
 * disagreeing about how far a step is.
 */
const cool: PictureEffect = {
  id: 'cool',
  label: 'Cool',
  description: 'Blue and a little harder, the way a cold morning looks.',
  stillSafe: true,
  params: [
    {
      key: 'coolness',
      label: 'Coolness',
      type: 'number',
      default: 45,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'number',
      default: 106,
      min: 90,
      max: 150,
      step: 2,
      hint: '%'
    }
  ],
  filter: ({ params }) => {
    const cast = warmCast(-Number(params.coolness) / 100);
    return [
      `eq=contrast=${n(Number(params.contrast) / 100)}:saturation=0.98`,
      `lutyuv=u='clip(val+${Math.round(cast.u)},0,255)':v='clip(val${Math.round(cast.v)},0,255)'`
    ];
  },
  css: ({ params }) => {
    const rgb = castRgb(warmCast(-Number(params.coolness) / 100));
    return {
      filter: `contrast(${n(Number(params.contrast) / 100)}) saturate(0.98)`,
      svg: {
        curves: {
          r: [n(rgb.r), n(1 + rgb.r)],
          g: [n(rgb.g), n(1 + rgb.g)],
          b: [n(rgb.b), n(1 + rgb.b)]
        }
      }
    } satisfies PictureCss;
  }
};

/**
 * Texture without an opinion about colour.
 *
 * Grain and a vignette used to be two tick boxes beside the tone, and every
 * look in the other pack now brings its own — so wanting either on otherwise
 * untouched footage had no answer once those boxes went. This is that answer:
 * nothing is graded, nothing is smeared, the picture is only roughened up.
 *
 * Both dials start at nothing, because the point of it is that you choose
 * which. An effect that does something the moment it is selected would make
 * "just a vignette" mean "a vignette and some grain you now have to turn off".
 */
const texture: PictureEffect = {
  id: 'texture',
  label: 'Texture',
  description: 'Grain and a vignette, with the colour left alone.',
  stillSafe: true,
  params: [
    { key: 'grain', label: 'Grain', type: 'number', default: 18, min: 0, max: 70, step: 2 },
    {
      key: 'vignette',
      label: 'Vignette',
      type: 'number',
      default: 0,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    }
  ],
  filter: ({ params }) => {
    const filters: string[] = [];
    const vignette = Number(params.vignette) / 100;
    if (vignette > 0) filters.push(`vignette=PI/${n(6.5 - vignette * 2.5)}`);
    const grain = Math.round(Number(params.grain));
    // Luma only, and after the vignette: grain sits on top of a picture, it is
    // not something the corners darken along with everything else.
    if (grain > 0) filters.push(`noise=c0s=${grain}:c0f=t+u`);
    return filters;
  },
  // Only the vignette, which CSS draws exactly. Grain is the one thing the
  // browser has no honest way to make, so it is left out rather than faked.
  css: ({ params }) => ({
    overlay:
      Number(params.vignette) > 0
        ? [
            {
              background:
                'radial-gradient(ellipse at center,' +
                ` transparent 45%, rgb(0 0 0 / ${n((Number(params.vignette) / 100) * 0.55)}) 100%)`
            }
          ]
        : undefined
  })
};

export const gradesPack: EffectPack = {
  id: 'grades',
  label: 'Grades',
  picture: [punch, cool, mono, texture]
};
