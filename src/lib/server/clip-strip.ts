import { readdir, unlink } from 'fs/promises';
import { join } from 'path';

/**
 * Where the timeline's contact sheets are cached, keyed `<mediaId>-<version>.jpg`.
 *
 * Keyed on the rendered media row rather than the project, which makes the key
 * correct by construction: every render writes a new row, so a re-render can
 * never be served the previous edit's frames and the cache never needs busting.
 * The cost is that the old sheet outlives the render it came from, hence this.
 */
export const CLIP_STRIP_DIR = 'data/uploads/.clip-strips';

/**
 * Removes the cached contact sheet for a rendered clip.
 *
 * Best-effort, like the preset swatches it sits beside: a stale JPEG is a few
 * hundred kilobytes and nothing reads it once its media row is gone, so it must
 * never be the reason a delete or a re-render fails.
 */
export async function removeClipStrip(mediaId: number): Promise<void> {
  try {
    const entries = await readdir(CLIP_STRIP_DIR);
    await Promise.all(
      entries
        // Both namings: `<id>-<version>.jpg` now, and the unversioned
        // `<id>.jpg` that the first sheets were written under.
        .filter((name) => name.startsWith(`${mediaId}-`) || name.startsWith(`${mediaId}.`))
        .map((name) => unlink(join(CLIP_STRIP_DIR, name)).catch(() => {}))
    );
  } catch {
    // The directory won't exist until the first sheet is cut.
  }
}
