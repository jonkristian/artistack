import qrcode from 'qrcode-generator';

/**
 * QR code rendering, as a self-contained SVG string.
 *
 * SVG rather than a raster image so it stays crisp at any size and needs no
 * canvas on the server. The encoder is a zero-dependency library — QR encoding
 * involves Reed-Solomon error correction, version selection and mask scoring,
 * which is not worth hand-rolling.
 */

export interface QrOptions {
  /**
   * Error-correction level. 'M' (~15% recoverable) is the usual default and
   * keeps the code small; higher levels survive damage but add modules, which
   * makes each module smaller on screen and can hurt scanning at close range.
   */
  level?: 'L' | 'M' | 'Q' | 'H';
  /** Quiet-zone width in modules. The spec requires 4; less can fail to scan. */
  margin?: number;
  dark?: string;
  light?: string;
}

/**
 * Encodes text as an SVG QR code.
 *
 * The result has no fixed pixel size — it scales to whatever the container
 * gives it via `width: 100%` — and draws the modules as a single path, which
 * keeps the markup small even for long URLs.
 */
export function qrSvg(text: string, options: QrOptions = {}): string {
  const { level = 'M', margin = 4, dark = '#000000', light = '#ffffff' } = options;

  // Type 0 lets the library pick the smallest version that fits the data.
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + margin * 2;

  // One path for every dark module beats one <rect> each: same result, a
  // fraction of the markup.
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        parts.push(`M${col + margin},${row + margin}h1v1h-1z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` shape-rendering="crispEdges" width="100%" height="100%">`,
    `<rect width="${size}" height="${size}" fill="${light}"/>`,
    `<path fill="${dark}" d="${parts.join('')}"/>`,
    `</svg>`
  ].join('');
}
