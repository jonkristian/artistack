/**
 * Clears up after clips: rows nothing points at, and files no row points at.
 *
 * Three things accumulate, and none of them used to be anyone's job.
 *
 * A quick render is replaced every time you make another, and only the one it
 * replaced was ever discarded — so deleting the clip left the last one behind
 * for good. `deleteProject` handles that now; this is for the ones already
 * stranded, and for anything a crash leaves half-done.
 *
 * The media pool keeps a row per file per project. Deleting the project left
 * those rows pointing at nothing. They are inert, but they are also the list
 * the editor reads, so they are worth not accumulating.
 *
 * And the swatch cache is keyed by source media id, so a frame cached against a
 * file that has since been deleted is a file nothing will ever ask for again.
 *
 * Deliberately conservative about what it will delete. Only media this app
 * produced — `role` of `render` or `proof` — and only files matching the names
 * it writes. A hand-uploaded asset is never swept, whatever it is called, and a
 * file it cannot account for is left alone rather than guessed about.
 */
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { eq, isNotNull, notInArray, or } from 'drizzle-orm';
import { db } from './db';
import { clipMedia, clipProjects, media } from './schema';
import { removeMediaFile, UPLOAD_DIR } from './paths';
import { CLIP_PRESETS } from '$lib/clips/types';
import { PICTURE_EFFECTS } from '$lib/clips/effects';

/**
 * How recently a file has to have been written to be spared.
 *
 * A render in flight has already put its output in place before the row that
 * points at it exists, so a sweep running at that moment would delete the file
 * out from under it. An hour is far longer than any render takes and far
 * shorter than anything worth keeping goes unnoticed.
 */
const GRACE_MS = 60 * 60 * 1000;

/** Files this app writes, and therefore files it may remove. */
const OURS = /^clip-(proof-)?\d+\.(mp4|jpg)$/;

export interface SweepResult {
  mediaRows: number;
  poolRows: number;
  files: number;
  swatches: number;
}

export async function sweepClipLeftovers(): Promise<SweepResult> {
  const result: SweepResult = { mediaRows: 0, poolRows: 0, files: 0, swatches: 0 };

  /*
   * Media rows of our own making that no clip claims.
   *
   * Both columns have to be checked: a row can be some project's finished
   * render and some other project's nothing at all, and an `IN` against one
   * column would call it orphaned.
   */
  const claimed = await db
    .select({ output: clipProjects.outputMediaId, proof: clipProjects.proofMediaId })
    .from(clipProjects);
  const live = new Set<number>();
  for (const row of claimed) {
    if (row.output) live.add(row.output);
    if (row.proof) live.add(row.proof);
  }

  const ours = await db
    .select({ id: media.id, url: media.url, thumbnailUrl: media.thumbnailUrl })
    .from(media)
    .where(or(eq(media.role, 'render'), eq(media.role, 'proof')));

  for (const row of ours) {
    if (live.has(row.id)) continue;
    for (const url of [row.url, row.thumbnailUrl]) {
      await removeMediaFile(url);
    }
    await db.delete(media).where(eq(media.id, row.id));
    result.mediaRows += 1;
  }

  // Pool rows whose project has gone.
  const projectIds = (await db.select({ id: clipProjects.id }).from(clipProjects)).map((p) => p.id);
  const orphanPool = projectIds.length
    ? await db
        .delete(clipMedia)
        .where(notInArray(clipMedia.projectId, projectIds))
        .returning({ id: clipMedia.id })
    : await db.delete(clipMedia).returning({ id: clipMedia.id });
  result.poolRows = orphanPool.length;

  /*
   * Files on disk that no row points at.
   *
   * The other direction from the sweep above: a row can be deleted without its
   * file if the process died between the two, and then nothing will ever name
   * that file again.
   */
  const known = new Set<string>();
  for (const row of await db
    .select({ url: media.url, thumbnailUrl: media.thumbnailUrl, previewUrl: media.previewUrl })
    .from(media)
    .where(isNotNull(media.url))) {
    for (const url of [row.url, row.thumbnailUrl, row.previewUrl]) {
      if (url) known.add(url.split('/').pop() as string);
    }
  }

  const now = Date.now();
  for (const name of await readdir(UPLOAD_DIR).catch(() => [])) {
    if (!OURS.test(name) || known.has(name)) continue;
    const path = join(UPLOAD_DIR, name);
    const info = await stat(path).catch(() => null);
    if (!info || now - info.mtimeMs < GRACE_MS) continue;
    await unlink(path).catch(() => {});
    result.files += 1;
  }

  /*
   * Swatches for footage that has gone, or for a look that has.
   *
   * Both happen. A swatch is keyed by source media, so deleting the file it was
   * taken from strands it — but so does retiring the look, and that is the one
   * easy to miss: removing the `clean` preset left a cached frame of it against
   * every clip anyone had ever opened the picker on, and nothing will ask for
   * any of them again.
   *
   * The name is `<mediaId>-<look>.jpg`, where the look is a preset id or `fx-`
   * and an effect id. Split on the first hyphen only, so a look whose own id
   * contains one still parses.
   */
  const mediaIds = new Set(
    (await db.select({ id: media.id }).from(media)).map((m) => String(m.id))
  );
  const looks = new Set([
    ...CLIP_PRESETS.map((p) => p.id),
    ...PICTURE_EFFECTS.map((e) => `fx-${e.id}`)
  ]);

  const swatchDir = join(UPLOAD_DIR, '.preset-previews');
  for (const name of await readdir(swatchDir).catch(() => [])) {
    const cut = name.indexOf('-');
    if (cut < 1 || !name.endsWith('.jpg')) continue;
    const owner = name.slice(0, cut);
    const look = name.slice(cut + 1, -'.jpg'.length);
    if (mediaIds.has(owner) && looks.has(look)) continue;
    await unlink(join(swatchDir, name)).catch(() => {});
    result.swatches += 1;
  }

  return result;
}

/** Whether anything was actually swept, for deciding whether to log. */
export const sweptAnything = (r: SweepResult) =>
  r.mediaRows + r.poolRows + r.files + r.swatches > 0;
