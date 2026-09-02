/**
 * Picking a foreground that can be read on a chosen colour.
 *
 * The accent is set in Appearance and can be anything. Buttons painted with it
 * had white text nailed on, which is fine for a violet and unreadable for a
 * yellow — so the text colour is derived from the accent rather than assumed.
 */

/** Accepts #abc and #aabbcc. Anything else is treated as dark, which is the safer guess. */
function channels(hex: string): [number, number, number] | null {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}

/**
 * Relative luminance, as WCAG defines it.
 *
 * Not a plain average of the channels: the eye is far more sensitive to green
 * than to blue, so a flat average calls a pure blue "light" and a pure green
 * "dark", and gets the text colour wrong for both.
 */
function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Black or white, whichever can be read on the given colour.
 *
 * 0.5 rather than the 0.179 that maximises contrast against pure white: at that
 * threshold a mid violet gets black text, which is legible but looks wrong on a
 * button. This favours white until a colour is genuinely light.
 */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#171717' : '#ffffff';
}

/**
 * How far apart two colours are, as WCAG's contrast ratio.
 *
 * 1 means identical, 21 is black on white. Worth having in the admin because
 * the failure it catches is silent: a panel painted in a colour a hair away
 * from the page behind it doesn't look wrong, it looks like it didn't render.
 */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Blend two colours, as a solid hex.
 *
 * For places that can't use `color-mix` — email, mostly, where a translucent
 * eight-digit hex is unevenly supported and a border that vanishes in Outlook
 * is worse than one that's slightly off.
 *
 * `weight` is how much of `a` to keep: 0.25 is a quarter of a, three quarters
 * of b.
 */
export function mixHex(a: string, b: string, weight: number): string {
  const from = channels(a);
  const to = channels(b);
  if (!from || !to) return b;

  const w = Math.min(1, Math.max(0, weight));
  const blend = from.map((value, i) => Math.round(value * w + to[i] * (1 - w)));
  return `#${blend.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
