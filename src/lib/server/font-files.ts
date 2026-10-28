/**
 * The same fonts the browser loads, as files libass can read.
 *
 * `@fontsource` ships woff2 and woff, and libass can read neither — it wants a
 * plain sfnt. But woff2 *is* an sfnt, compressed: decompressing one gives back
 * the TrueType it was made from, byte for byte. So one npm package per family
 * feeds both halves, and a caption is burned in the same drawing the site is
 * set in rather than in whatever fontconfig had lying about.
 *
 * Which also takes the renderer off the container's fonts entirely. The
 * deployed image has no Inter and no Italiana, `nixpacks.toml`'s font packages
 * have never been confirmed in a built image, and `fc-match` answers *something*
 * whether or not it found what you asked for. Handed a directory, libass looks
 * there first and the answer is the same everywhere.
 *
 * Written lazily into `data/` rather than at build time, because `data/` is a
 * mounted volume on both deployments — anything the build put there would be
 * hidden the moment the volume went on. One decompression per family per
 * deployment, a few tens of milliseconds each, and then never again.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { FONTS, fontById, type FontFace } from '../fonts';

const require = createRequire(import.meta.url);

/** Where the TrueType copies live. Beside the renders, on the same volume. */
const FONT_DIR = join(process.cwd(), 'data', 'fonts');

/**
 * The weights worth having as files, as opposed to in a browser.
 *
 * Two: the one captions are set in and the one bold gives you. libass will
 * thicken a regular face when asked for bold and there is nothing else, which
 * looks like bold from a distance and like a smudge up close — so where a
 * family has a real 700 it is worth the second file. Everything between is for
 * the site, where it costs a download and not a decompression.
 */
const WANTED = [400, 700];

const fileName = (font: FontFace, weight: number) => `${font.id}-${weight}.ttf`;

/** The woff2 `@fontsource` ships for this family and weight, if it ships one. */
function sourcePath(font: FontFace, weight: number): string | null {
  if (!font.weights.includes(weight)) return null;
  try {
    // Resolved through the package rather than built from a path, so a layout
    // change in @fontsource is an error here rather than a missing caption.
    return require.resolve(`${font.pkg}/files/${font.id}-latin-${weight}-normal.woff2`);
  } catch {
    return null;
  }
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false
  );

/**
 * Makes sure every face has its TrueType copies, and answers where they are.
 *
 * Idempotent and cheap after the first run: a file already written is left
 * alone. A family that fails to convert is skipped rather than fatal — one
 * broken package shouldn't stop a render whose caption is in a different face.
 */
let ready: Promise<string> | null = null;

export function fontsDir(): Promise<string> {
  ready ??= build();
  return ready;
}

async function build(): Promise<string> {
  await mkdir(FONT_DIR, { recursive: true });

  // Imported here rather than at the top: it carries a WebAssembly payload,
  // and nothing outside a render needs it loaded.
  const { decompress } = await import('wawoff2');

  for (const font of FONTS) {
    for (const weight of WANTED) {
      const target = join(FONT_DIR, fileName(font, weight));
      if (await exists(target)) continue;

      const source = sourcePath(font, weight);
      if (!source) continue;

      try {
        const ttf = await decompress(await readFile(source));
        await writeFile(target, Buffer.from(ttf));
      } catch (e) {
        console.error(`[fonts] Could not unpack ${font.name} ${weight}:`, e);
      }
    }
  }

  return FONT_DIR;
}

/**
 * The family name to write into the subtitle file, and the directory to find
 * it in.
 *
 * The name is the family as the font itself declares it, which is what libass
 * matches on — not the id, which is ours. An unknown id falls back to the
 * first face rather than to nothing: a caption in the wrong font is a smaller
 * failure than a caption that doesn't draw.
 */
export async function captionFont(id: string | null | undefined): Promise<{
  family: string;
  dir: string;
}> {
  const font = fontById(id) ?? FONTS[0];
  return { family: font.name, dir: await fontsDir() };
}
