import { join } from 'path';

/**
 * Where the app writes to disk. Centralised because `data/` has to be a
 * persistent volume in production — when that path moves, it moves once.
 */
export const DATA_DIR = 'data';
export const UPLOAD_DIR = 'data/uploads';

/** Longest edge of a generated thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 400;

/**
 * Resolves a media row's public URL to a path on disk. `join` absorbs the
 * leading slash on a stored URL, so callers don't strip it first.
 */
export function mediaPath(url: string): string {
  return join(DATA_DIR, url);
}
