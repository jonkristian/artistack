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
