/**
 * Footage that has been through something.
 *
 * Three looks built from the same handful of cheap filters, because what
 * separates a tape from a film reel from a camcorder is mostly which artefacts
 * you keep and how far you push them: how much colour survives, how far the
 * chroma has wandered from the luma, how soft it got, and what kind of noise it
 * picked up on the way.
 *
 * Nothing here uses `geq`. Per-pixel expressions are the obvious way to write
 * scan lines and tracking wobble, and they cost about six times the rest of a
 * chain put together — measured, on this frame size. Everything in this pack
 * runs at roughly the price of the film grain option that was already there, so
 * turning a look on doesn't change what rendering a clip costs you.
 *
 * The order within each look matters and is deliberate: grade first, because it
 * is what the camera saw; then the chroma errors, because those happened to the
 * signal; then softness, because that is the tape or the lens; then noise last,
 * because noise is picked up after everything else and should not be blurred by
 * a filter that runs later.
 */
import type { EffectPack, PictureCss, PictureEffect, PictureGraphContext } from './types';

/** Two decimal places is plenty, and keeps the filter strings readable. */
const n = (value: number) => Number(value.toFixed(2));

const vhs: PictureEffect = {
  id: 'vhs',
  label: 'VHS',
  description: 'Washed out, chroma bleeding sideways, soft, with tape noise.',
  stillSafe: true,
  params: [
    {
      key: 'bleed',
      label: 'Chroma bleed',
      type: 'number',
      default: 5,
      min: 0,
      max: 24,
      step: 1,
      hint: 'px'
    },
    { key: 'softness', label: 'Softness', type: 'number', default: 0.6, min: 0, max: 3, step: 0.1 },
    { key: 'noise', label: 'Tape noise', type: 'number', default: 18, min: 0, max: 60, step: 2 },
    {
      key: 'colour',
      label: 'Colour left',
      type: 'number',
      default: 82,
      min: 0,
      max: 130,
      step: 2,
      hint: '%'
    }
  ],
  filter: ({ params }) => {
    const bleed = Number(params.bleed);
    const softness = Number(params.softness);
    const noise = Number(params.noise);
    const filters = [
      `eq=saturation=${n(Number(params.colour) / 100)}:contrast=1.06:brightness=0.01`,
      /*
       * Lifted blacks and a pulled-back top end, which is what a tape actually
       * does to the range — the whole picture sits in a narrower band. Written
       * as curves rather than as `eq` levels because the two ends move by
       * different amounts and blue lifts further than red, which is where the
       * faintly cold look in the shadows comes from.
       */
      `curves=r='0/0.04 1/0.96':b='0/0.05 1/0.94'`
    ];
    if (bleed > 0) {
      // Two different errors, not one twice: the RGB split is the signal
      // arriving out of step, the chroma shift is the colour being recorded at
      // a fraction of the detail of the brightness and smearing as a result.
      filters.push(`rgbashift=rh=${-Math.round(bleed * 0.6)}:bh=${Math.round(bleed * 0.6)}`);
      filters.push(
        `chromashift=crh=${Math.round(bleed)}:cbh=${-Math.round(bleed * 0.6)}:edge=smear`
      );
    }
    if (softness > 0) filters.push(`gblur=sigma=${n(softness)}`);
    // Luma only. Colour noise reads as digital; tape grain sits in brightness.
    if (noise > 0) filters.push(`noise=c0s=${Math.round(noise)}:c0f=t+u`);
    return filters;
  },

  /*
   * The same look minus the tape noise, which the browser has no honest way to
   * make. Everything that gives the picture its shape is here: the wash, the
   * lifted blacks, the colour coming apart sideways and the softness.
   */
  css: ({ params, width }) => {
    const bleed = Number(params.bleed);
    return {
      filter: `saturate(${n(Number(params.colour) / 100)}) contrast(1.06) brightness(1.01)`,
      svg: {
        // The same two control points the `curves` filter is given.
        curves: { r: [0.04, 0.96], b: [0.05, 0.94] },
        split: bleed > 0 ? { r: (-bleed * 0.6) / width, b: (bleed * 0.6) / width } : undefined,
        blur: Number(params.softness) > 0 ? Number(params.softness) / width : undefined
      }
    } satisfies PictureCss;
  }
};

const super8: PictureEffect = {
  id: 'super8',
  label: 'Super 8',
  description: 'Warm, contrasty and grainy, the way small-gauge film goes.',
  stillSafe: true,
  params: [
    {
      key: 'warmth',
      label: 'Warmth',
      type: 'number',
      default: 60,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    { key: 'grain', label: 'Grain', type: 'number', default: 26, min: 0, max: 70, step: 2 },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'number',
      default: 118,
      min: 80,
      max: 160,
      step: 2,
      hint: '%'
    }
  ],
  filter: ({ params }) => {
    const warmth = Number(params.warmth) / 100;
    const grain = Number(params.grain);
    const filters = [
      `eq=contrast=${n(Number(params.contrast) / 100)}:saturation=1.05`,
      /*
       * Warmth as a curve rather than a hue rotation: film went warm by holding
       * on to red and losing blue, which bends the ends of two channels and
       * leaves the middle roughly where it was. `hue` would swing the whole
       * frame towards orange and take the greens with it.
       */
      `curves=r='0/0 0.5/${n(0.5 + warmth * 0.06)} 1/1':b='0/${n(warmth * 0.03)} 0.5/${n(0.5 - warmth * 0.05)} 1/${n(1 - warmth * 0.02)}'`,
      'vignette=PI/4.5'
    ];
    if (grain > 0) filters.push(`noise=c0s=${Math.round(grain)}:c0f=t+u`);
    return filters;
  },

  // The grade and nothing else: grain and vignette are texture rather than
  // shape, and a browser guess at either would be a worse likeness than none.
  css: ({ params }) => {
    const warmth = Number(params.warmth) / 100;
    return {
      filter: `contrast(${n(Number(params.contrast) / 100)}) saturate(1.05)`,
      svg: {
        curves: {
          r: [0, n(0.5 + warmth * 0.06), 1],
          b: [n(warmth * 0.03), n(0.5 - warmth * 0.05), n(1 - warmth * 0.02)]
        }
      }
    } satisfies PictureCss;
  }
};

/**
 * A picture that has been through a tube.
 *
 * The other two looks in this pack are grades — they change what colour things
 * are. This one changes the shape of the picture, which is what was missing
 * when it was only a cold cast and some noise: it read as the same footage,
 * slightly bluer. What makes nineties video look like nineties video is that it
 * never had the resolution, the lens bulged, the hand shook and you were
 * watching it on a tube with visible lines.
 *
 * All of it in ordinary ffmpeg filters, none of them expensive. Scan lines were
 * the awkward one — the obvious `geq` costs twenty-eight times the encode, and
 * `drawgrid` draws exactly the same thing for a twentieth of that, because it
 * is a rectangle fill rather than an expression evaluated per pixel.
 *
 * Order is the order it happened to the signal: grade and chroma error in the
 * camera, then the resolution it was recorded at, then the shake, then the lens
 * it was watched through, then noise picked up on the way — and the scan lines
 * last, because those belong to the screen rather than to the picture, and are
 * the one thing that stays straight while everything else bends.
 */
/**
 * A cold cast as a pair of chroma offsets, from one dial.
 *
 * Stated here rather than inside either half, because both need it and they
 * have to agree: the render shifts the chroma planes directly, the preview has
 * to say the same thing in red, green and blue.
 */
const coldCast = (cast: number) => ({ u: cast * 13, v: -cast * 9 });

/**
 * Those offsets as the colour shift a browser would apply.
 *
 * The ordinary BT.601 conversion, on differences rather than values — the luma
 * term drops out because a cast changes no brightness, which leaves only what
 * U and V contribute to each channel.
 */
const coldRgb = ({ u, v }: { u: number; v: number }) => ({
  r: (1.402 * v) / 255,
  g: (-0.344 * u - 0.714 * v) / 255,
  b: (1.772 * u) / 255
});

const camcorder: PictureEffect = {
  id: 'camcorder',
  label: 'Camcorder',
  description: 'Scan lines, a bulging lens and a picture that never had the resolution.',
  stillSafe: true,
  params: [
    {
      key: 'cast',
      label: 'Cold cast',
      type: 'number',
      default: 45,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'resolution',
      label: 'Resolution',
      type: 'number',
      default: 55,
      min: 25,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'scanlines',
      label: 'Scan lines',
      type: 'number',
      default: 35,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'bulge',
      label: 'Lens bulge',
      type: 'number',
      default: 14,
      min: 0,
      max: 40,
      step: 2,
      hint: '%'
    },
    {
      key: 'wobble',
      label: 'Wobble',
      type: 'number',
      default: 4,
      min: 0,
      max: 20,
      step: 1,
      hint: 'px'
    },
    {
      key: 'switching',
      label: 'Head switching',
      type: 'number',
      default: 60,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    {
      key: 'tracking',
      label: 'Tracking noise',
      type: 'number',
      default: 40,
      min: 0,
      max: 100,
      step: 5,
      hint: '%'
    },
    { key: 'noise', label: 'Noise', type: 'number', default: 14, min: 0, max: 50, step: 2 }
  ],

  filter: ({ params, width, height }) => {
    const cast = Number(params.cast) / 100;
    const cold = coldCast(cast);
    const resolution = Number(params.resolution) / 100;
    const bulge = Number(params.bulge) / 100;
    const wobble = Math.round(Number(params.wobble));
    const noise = Math.round(Number(params.noise));

    /* Encoders want even dimensions, and so does every scaler on the way. */
    const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

    const filters = [
      'eq=contrast=1.16:saturation=0.9',
      /*
       * The cast as a chroma shift, not a curve.
       *
       * `curves` is RGB-native and everything either side of it here is YUV, so
       * putting one in the chain makes ffmpeg convert the whole frame to RGB
       * and back — two full passes over every pixel. Measured on fifteen
       * seconds at 1080×1920 that is 6.7 of this look's 10.3 seconds, for a
       * blue lift and a red trim that `lutyuv` does in the frame's own colour
       * space for nothing. The results differ by about 3.6 parts in 255, which
       * is not a difference anybody can see.
       *
       * U carries blue-difference and V carries red-difference, so a cold cast
       * is U up and V down. Cheap, and closer to what the format actually is.
       */
      `lutyuv=u='clip(val+${Math.round(cold.u)},0,255)':v='clip(val${Math.round(cold.v)},0,255)'`,
      // Chroma recorded at less detail than luma, which is what smears it.
      `chromashift=crh=${Math.max(1, Math.round(width / 270))}:edge=smear`
    ];

    /*
     * Thrown away and put back, rather than blurred.
     *
     * A blur loses the detail and leaves smooth edges; a downscale followed by
     * a nearest-neighbour upscale loses the detail and leaves the chunky ones
     * it was actually recorded with. The second is what low-resolution video
     * looks like and the first is what a soft lens looks like.
     */
    if (resolution < 1) {
      filters.push(`scale=${even(width * resolution)}:${even(height * resolution)}`);
      filters.push(`scale=${width}:${height}:flags=neighbor`);
    }

    /*
     * A hand that never quite holds still. Cropped and put back to size, so the
     * frame moves within the picture rather than the picture moving within the
     * frame — which would show an edge.
     */
    if (wobble > 0) {
      filters.push(`crop=iw:ih-${wobble * 2}:0:'${wobble}+${wobble}*sin(t*2.7)'`);
      filters.push(`scale=${width}:${height}`);
    }

    if (bulge > 0) {
      filters.push(`lenscorrection=k1=-${n(bulge)}:k2=-0.02:i=bilinear`);
    }

    if (noise > 0) filters.push(`noise=c0s=${noise}:c0f=t+u`);

    /*
     * The screen, not the signal.
     *
     * Spaced against a nominal 480 lines rather than a fixed pixel count, so
     * the lines stay the same share of the picture whether the clip is 1080 or
     * 1920 tall. `w=0` asks for no vertical lines: this is a grid with one
     * direction turned off, which is the cheapest way ffmpeg will draw a
     * repeating rule.
     */
    const strength = Number(params.scanlines) / 100;
    if (strength > 0) {
      const spacing = Math.max(2, Math.round(height / 480));
      filters.push(`drawgrid=w=0:h=${spacing}:t=1:c=black@${n(strength)}`);
    }

    return filters;
  },

  /**
   * The two artefacts that are pieces of picture rather than properties of it.
   *
   * Head switching is the strip at the very bottom where the tape head changed
   * over mid-field: a few per cent of the frame, pulled sideways, bleached and
   * full of noise, with a black gap at one edge where the shifted signal ran
   * out. It is the most recognisable thing about tape, and it is not a filter —
   * it is a slice of the picture taken away, ruined, and put back.
   *
   * Tracking noise is the same move on a band that drifts slowly up the frame,
   * the way a mistracked tape does. Cropped from where it is about to be drawn,
   * so it damages what is actually behind it rather than smearing something
   * from elsewhere across it.
   *
   * `enable` goes on the overlays rather than the crops. A disabled filter
   * passes its input straight through, so gating a crop would hand the overlay
   * a whole frame instead of a band — the opposite of switching it off.
   */
  graph: ({ params, input, output, id }: PictureGraphContext) => {
    const switching = Number(params.switching) / 100;
    const tracking = Number(params.tracking) / 100;
    // Something still has to connect the two ends, even with nothing to do.
    if (switching <= 0 && tracking <= 0) return [`${input}null${output}`];

    const main = `[main${id}]`;
    const taps: string[] = [main];
    if (switching > 0) taps.push(`[hs${id}]`);
    if (tracking > 0) taps.push(`[tr${id}]`);

    const lines = [`${input}split=${taps.length}${taps.join('')}`];
    let over = main;
    let tap = 1;

    if (switching > 0) {
      const band = `[hsband${id}]`;
      const height = n(0.02 + switching * 0.035);
      const top = n(0.98 - switching * 0.035);
      lines.push(
        `${taps[tap++]}crop=iw:ih*${height}:0:ih*${top},` +
          `noise=alls=${Math.round(30 + switching * 30)}:allf=t+u,` +
          `rgbashift=rh=-${Math.round(switching * 40)}:bh=${Math.round(switching * 24)},` +
          `eq=brightness=0.06:saturation=${n(1 - switching * 0.7)}${band}`
      );
      const out = tracking > 0 ? `[hsout${id}]` : output;
      lines.push(
        `${over}${band}overlay=x='-${Math.round(switching * 56)}+${Math.round(switching * 16)}*sin(t*3)':` +
          `y=H*${top}${out}`
      );
      over = out;
    }

    if (tracking > 0) {
      const band = `[trband${id}]`;
      /* One slow pass up the frame every eleven seconds; a tape drifts rather
         than strobes, and the crop and the overlay read the same sum so the
         band is always taken from exactly where it lands. */
      const at = (h: string) => `${h}*0.12+${h}*0.62*mod(t*0.09,1)`;
      lines.push(
        `${taps[tap++]}crop=iw:ih*${n(0.012 + tracking * 0.03)}:0:'${at('ih')}',` +
          `noise=alls=${Math.round(40 + tracking * 45)}:allf=t+u,` +
          `eq=brightness=${n(tracking * 0.14)}:saturation=${n(1 - tracking * 0.8)},` +
          `rgbashift=rh=-${Math.round(tracking * 22)}${band}`
      );
      lines.push(
        `${over}${band}overlay=x='${Math.round(tracking * 20)}*sin(t*7)':y='${at('H')}'${output}`
      );
    }

    return lines;
  },

  css: ({ params, width, at }) => {
    const cast = Number(params.cast) / 100;
    const strength = Number(params.scanlines) / 100;
    const resolution = Number(params.resolution) / 100;
    /*
     * The same shift the render makes, said in the colours a browser works in.
     *
     * One number decides the cast and both halves derive from it through the
     * standard conversion, rather than each carrying its own hand-tuned
     * version that would drift the first time either was touched. A flat offset
     * per channel is a two-point table: the ramp moved bodily up or down, which
     * is what adding a constant does, and the clamping at each end is the same
     * clamping `clip()` does on the other side.
     */
    const rgb = coldRgb(coldCast(cast));
    const switching = Number(params.switching) / 100;
    const tracking = Number(params.tracking) / 100;
    /** Where the tracking band has drifted to, by the render's own sum. */
    const trackAt = 0.12 + 0.62 * ((at * 0.09) % 1);

    return {
      filter: 'contrast(1.16) saturate(0.9)',
      svg: {
        curves: {
          r: [n(rgb.r), n(1 + rgb.r)],
          g: [n(rgb.g), n(1 + rgb.g)],
          b: [n(rgb.b), n(1 + rgb.b)]
        },
        split: { r: Math.max(1, Math.round(width / 270)) / width },
        /*
         * Standing in for the resolution loss, which the browser cannot do:
         * scaling an element down and back up is the layout engine's business
         * and it would resample smoothly anyway, which is the wrong kind of
         * loss. A little softness says "this is not sharp" honestly, without
         * pretending to the blocky edges the render actually produces.
         */
        blur: resolution < 1 ? ((1 - resolution) * 1.6) / width : undefined
      },
      overlay: [
        /*
         * Drawn at a size you can see rather than at the render's spacing; see
         * the note on PictureOverlay. `multiply` rather than a flat black at
         * low opacity, so the lines darken the picture instead of greying it.
         */
        ...(strength > 0
          ? [
              {
                background:
                  'repeating-linear-gradient(to bottom,' +
                  ` rgb(0 0 0 / ${n(strength)}) 0 1px, transparent 1px 3px)`,
                blend: 'multiply'
              }
            ]
          : []),
        /*
         * The two bands, as strips of damaged picture rather than marks on it —
         * which is what `backdrop` is for. The browser cannot pull them
         * sideways the way the render does, so they read as bleached and noisy
         * where they should read as bleached, noisy and torn. Enough to say
         * where they are and how wide, which is what anyone is judging.
         */
        ...(switching > 0
          ? [
              {
                inset: `${n((0.98 - switching * 0.035) * 100)}% 0 0 0`,
                backdrop: `saturate(${n(1 - switching * 0.7)}) brightness(1.12) blur(0.5px)`
              }
            ]
          : []),
        ...(tracking > 0
          ? [
              {
                // The same sum the render's crop and overlay both read, so the
                // band is in the same place at the same moment in both.
                inset:
                  `${n(trackAt * 100)}% 0 ` +
                  `${n((1 - trackAt - (0.012 + tracking * 0.03)) * 100)}% 0`,
                backdrop: `saturate(${n(1 - tracking * 0.8)}) brightness(${n(1 + tracking * 0.14)})`
              }
            ]
          : [])
      ]
    } satisfies PictureCss;
  }
};

export const vhsPack: EffectPack = {
  id: 'vintage',
  label: 'Vintage',
  picture: [vhs, super8, camcorder]
};
