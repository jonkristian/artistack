/**
 * The woff2 codec, which ships no types of its own.
 *
 * Its own file rather than a block in `app.d.ts`: that one ends in `export {}`,
 * which makes it a module, and `declare module` inside a module augments an
 * existing type rather than describing an untyped package.
 *
 * Only `decompress` is used, and only by `font-files.ts` — woff2 is a
 * compressed sfnt, so it gives back the TrueType libass needs from the same
 * file the browser loads.
 */
declare module 'wawoff2' {
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
  export function compress(input: Uint8Array): Promise<Uint8Array>;
}
