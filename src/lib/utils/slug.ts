/**
 * Turns free text into a URL-safe slug.
 *
 * Shared because two things depend on producing the *same* answer: campaign
 * links (/c/<slug>) and tag identity. If tag slugging drifted from this, the
 * vocabulary would split on casing again.
 */
/**
 * Letters NFD won't decompose, because they are distinct letters rather than an
 * accented base. Without these, Norwegian slugs lose characters outright:
 * "Tromsø" became "troms-" and "Blåbær" became "blab-r".
 */
const TRANSLITERATE: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  þ: 'th'
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u00e6\u00f8\u00df\u0111\u00fe]/g, (c) => TRANSLITERATE[c])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Slugs that a page may not claim.
 *
 * Pages are addressed flat — `/i-will-be-me`, not `/r/i-will-be-me` — because a
 * smart link gets read off a poster and pasted into a chat, and the prefix is
 * noise there. The cost is that page slugs share a namespace with the app's own
 * routes, so a collision has to be refused at creation rather than discovered
 * later as a page that mysteriously 404s.
 *
 * Keep this in step with the top level of src/routes.
 */
export const RESERVED_SLUGS = [
  'admin',
  'api',
  'c',
  'go',
  'u',
  'uploads',
  'preview',
  'privacy',
  'invite',
  'login',
  'unsubscribe',
  'healthz',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'favicon.ico',
  // Served by the favicon route
  'apple-touch-icon.png',
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'icon-192.png',
  'icon-512.png',
  // The landing page lives at `/`, so its slug is an internal handle only —
  // reachable at /home would be a second URL for the same content.
  'home',
  // Not routes yet, but taken often enough that handing them out would hurt.
  'assets',
  'static',
  '_app'
] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase());
}

export type SlugError = 'empty' | 'reserved' | 'invalid';

/** Returns null when the slug is usable as a page address, otherwise why not. */
export function validateSlug(slug: string): SlugError | null {
  if (!slug) return 'empty';
  if (isReservedSlug(slug)) return 'reserved';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'invalid';
  return null;
}

export const SLUG_ERROR_MESSAGES: Record<SlugError, string> = {
  empty: 'Give the page a URL.',
  reserved: 'That address is used by the app. Pick another.',
  invalid: 'Use lowercase letters, numbers and hyphens only.'
};
