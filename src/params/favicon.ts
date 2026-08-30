import type { ParamMatcher } from '@sveltejs/kit';

/**
 * Restricts the root-level favicon route to the files it actually serves.
 *
 * Without this it is an unmatched `[param]` at the root and swallows every
 * single-segment URL, which leaves no room for page slugs. Keep in step with
 * ALLOWED_FILES in src/routes/[favicon=favicon]/+server.ts.
 */
const FAVICON_FILES = new Set([
  'apple-touch-icon.png',
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'icon-192.png',
  'icon-512.png'
]);

export const match: ParamMatcher = (param) => FAVICON_FILES.has(param);
