import { join, normalize } from 'path';
import { unlink } from 'fs/promises';

/**
 * Where the app writes to disk. Centralised because `data/` has to be a
 * persistent volume in production — when that path moves, it moves once.
 */
export const DATA_DIR = 'data';
export const UPLOAD_DIR = 'data/uploads';

/** Longest edge of a generated thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 400;

/**
 * The shape of every URL this app stores on a media row.
 *
 * Flat and public: `/uploads/<name>`, with no directory separators left in the
 * name. Everything that writes one builds it from a timestamp and an extension
 * it chose itself, so nothing legitimate has ever looked different.
 *
 * Worth stating as a rule rather than trusting the writers, because the row is
 * also what the *deleters* read — `deleteMedia` unlinks whatever the row says,
 * and the media commands accept a URL from the browser. A row saying
 * `../../.env` was a way to reach outside `data/` with an editor's session.
 */
const MEDIA_URL = /^\/uploads\/[A-Za-z0-9._-]+$/;

/** True when a stored URL points somewhere this app is allowed to touch. */
export function isMediaUrl(url: string): boolean {
  return MEDIA_URL.test(url) && !url.includes('..');
}

/**
 * Resolves a media row's public URL to a path on disk.
 *
 * Throws rather than returning something wrong: every caller uses the result to
 * read, overwrite or delete a file, so a URL that doesn't resolve inside the
 * uploads directory is not a path to fall back on. Checking the resolved path
 * as well as the URL's shape means an encoded or nested traversal can't slip
 * through on the strength of matching a pattern.
 */
export function mediaPath(url: string): string {
  const path = normalize(join(DATA_DIR, url));

  if (!isMediaUrl(url) || !path.startsWith(normalize(UPLOAD_DIR) + '/')) {
    throw new Error(`Refusing to resolve a media URL outside the uploads directory: ${url}`);
  }

  return path;
}

/**
 * Deletes a file a media row points at, if it is one we're allowed to delete.
 *
 * Best-effort on purpose, and the one helper every cleanup path uses: a file
 * that has already gone is the state we wanted, and a row left over from before
 * `mediaPath` started refusing bad URLs must not be able to fail a delete — or
 * to have its URL followed.
 */
export async function removeMediaFile(url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    await unlink(mediaPath(url));
  } catch {
    // Already gone, or never ours to remove.
  }
}
