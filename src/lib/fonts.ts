/**
 * The faces this site can be set in, and the ones a caption can be burned in.
 *
 * One list, because until now there were two and they could not meet. The site
 * pulled Inter and Italiana off Google Fonts with a `<link>`, which is a thing
 * only a browser understands; the renderer asked `fc-match` for whatever
 * fontconfig had, which is a thing only the container understands. A `<link>`
 * means nothing to ffmpeg and an apt package means nothing to a browser — and
 * the container has neither Inter nor Italiana, so the site's own typeface
 * could never appear on one of its own captions.
 *
 * A font we ship as a file is the one thing both halves can read. These come
 * from `@fontsource`, which packages each family as woff2 for the browser;
 * `font-files.ts` turns the same woff2 back into TrueType for libass, so the
 * two are the same bytes rather than two fonts with one name.
 *
 * Eight, deliberately. A list this long is a choice; a list of forty is a
 * search, and every entry is a package, a download and a face to look after.
 */
export interface FontFace {
  /** Stored in settings and in a clip's config. Never shown. */
  id: string;
  /** The family name: what CSS asks for and what libass matches on. */
  name: string;
  /** The npm package the files come from. */
  pkg: string;
  /** What the browser falls back to while it loads, and if it can't. */
  fallback: string;
  /**
   * The weights shipped, lightest first.
   *
   * 400 is always among them. A display face often has nothing else — Anton
   * and Bebas Neue are one weight by design, and asking for bold gets you a
   * thickened 400 rather than a different drawing.
   */
  weights: number[];
}

export const FONTS: FontFace[] = [
  {
    id: 'inter',
    name: 'Inter',
    pkg: '@fontsource/inter',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weights: [300, 400, 500, 600, 700]
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    pkg: '@fontsource/space-grotesk',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weights: [300, 400, 500, 600, 700]
  },
  {
    id: 'oswald',
    name: 'Oswald',
    pkg: '@fontsource/oswald',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weights: [300, 400, 500, 600, 700]
  },
  {
    /*
     * The one face here that isn't typeset in the usual sense.
     *
     * It replaced Archivo Narrow, which was a condensed grotesque in a list
     * that already had Oswald, Anton and Bebas Neue — four of eight narrow,
     * and at text sizes it simply read as a tighter Inter. A monospace is a
     * different skeleton rather than a different width, which is what makes a
     * list of eight worth having.
     */
    id: 'space-mono',
    name: 'Space Mono',
    pkg: '@fontsource/space-mono',
    fallback: 'ui-monospace, SFMono-Regular, monospace',
    weights: [400, 700]
  },
  {
    id: 'anton',
    name: 'Anton',
    pkg: '@fontsource/anton',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weights: [400]
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    pkg: '@fontsource/bebas-neue',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weights: [400]
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    pkg: '@fontsource/playfair-display',
    fallback: 'ui-serif, Georgia, serif',
    weights: [400, 500, 600, 700]
  },
  {
    id: 'italiana',
    name: 'Italiana',
    pkg: '@fontsource/italiana',
    fallback: 'ui-serif, Georgia, serif',
    weights: [400]
  }
];

const BY_ID = new Map(FONTS.map((font) => [font.id, font]));

/** The face with this id, or null — a setting written before a face was dropped. */
export function fontById(id: string | null | undefined): FontFace | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** What CSS should be given for a face, fallbacks and all. */
export function fontStack(id: string | null | undefined, fallback = FONTS[0]): string {
  const font = fontById(id) ?? fallback;
  return `'${font.name}', ${font.fallback}`;
}
