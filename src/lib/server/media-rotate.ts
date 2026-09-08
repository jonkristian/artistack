import { stat, unlink, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { media } from './schema';
import { UPLOAD_DIR, THUMBNAIL_SIZE, mediaPath } from './paths';
import { canRotateLosslessly, extractPosterFrame, probeVideo, writeRotation } from './ffmpeg';
import { queuePreviewRendition, removePreview } from './media-preview';

/**
 * Turns a video a quarter clockwise, by correcting the file rather than the
 * clips that use it.
 *
 * Rotation is not a creative choice about one edit — it's a correction to
 * footage the camera stored the wrong way up. So it belongs to the file, and
 * every clip using it, every thumbnail of it and every player pointed at it
 * gets the same answer. The per-source `rotation` column exists only for
 * containers that can't say which way up they are.
 *
 * Nothing is re-encoded. The rotation lives in the container's display matrix,
 * which is a stream copy to write and which every decoder already applies — so
 * the renderer needs no filter, and the library's own thumbnail comes out
 * upright once it's regenerated below.
 */
export async function rotateMedia(
  mediaId: number,
  /**
   * How far to turn it, clockwise, on top of whatever the file already says.
   *
   * More than a quarter when a source is carrying a turn that only ever
   * happened at render time: that correction is real and already on screen, so
   * it has to move into the file rather than be dropped, or the picture would
   * spin back the moment the column is cleared.
   */
  addDegrees = 90
): Promise<
  | { ok: true; rotation: number }
  /** The container can't carry a rotation; the caller should fall back. */
  | { ok: false; reason: 'unsupported' | 'missing' }
> {
  const [item] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!item?.url) return { ok: false, reason: 'missing' };

  const current = mediaPath(item.url);
  if (!canRotateLosslessly(current)) return { ok: false, reason: 'unsupported' };

  const before = await probeVideo(current).catch(() => null);
  if (!before) return { ok: false, reason: 'missing' };

  const next = (((before.rotation + addDegrees) % 360) + 360) % 360;

  /*
   * Written beside the original under a new name, then swapped in.
   *
   * Not in place, for two reasons. A browser that has the old file cached would
   * go on showing it — same URL, same picture, sideways — and there would be a
   * moment during the copy where the only version of someone's footage is half
   * written. A new name costs one file's worth of disk for a second.
   */
  const ext = extname(current);
  /*
   * Any previous rotation's stamp comes off first. Appending blindly meant a
   * clip turned four times ended up called
   * `media-1788711577965-rmtq2o58r-rmtq2o7vq-rmtq2o9ol-rmtq2ocf3.mp4`, and a
   * name that grows every time is a name that eventually doesn't fit.
   */
  const stem = basename(current, ext).replace(/(?:-r[a-z0-9]{6,})+$/i, '');
  const stamp = Date.now().toString(36);
  const rotatedName = `${stem}-r${stamp}${ext}`;
  const rotatedPath = join(UPLOAD_DIR, rotatedName);

  await writeRotation(current, rotatedPath, next);

  const after = await probeVideo(rotatedPath);

  let thumbnailUrl = item.thumbnailUrl;
  let thumbnailName: string | null = null;
  try {
    const poster = await extractPosterFrame(rotatedPath, after.duration);
    const buffer = await sharp(poster)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    thumbnailName = `${stem}-r${stamp}-thumb.webp`;
    await writeFile(join(UPLOAD_DIR, thumbnailName), buffer);
    thumbnailUrl = `/uploads/${thumbnailName}`;
  } catch (e) {
    // A stale thumbnail is a wrong picture in the library, not a broken file.
    // Worth saying, not worth undoing a good rotation over.
    console.error('[Rotate] Could not regenerate the thumbnail:', e);
  }

  /*
   * The preview is a copy of the same footage, so it needs the same turn — and
   * being an mp4 it takes one the same cheap way. Regenerating it instead would
   * mean a transcode for something a stream copy fixes.
   */
  let previewUrl = item.previewUrl;
  if (previewUrl) {
    const previewPath = mediaPath(previewUrl);
    const previewExt = extname(previewPath);
    const turnedName = `${stem}-r${stamp}-preview${previewExt}`;
    try {
      await writeRotation(previewPath, join(UPLOAD_DIR, turnedName), next);
      await unlink(previewPath).catch(() => {});
      previewUrl = `/uploads/${turnedName}`;
    } catch (e) {
      // Better no preview than one facing the wrong way: readers fall back to
      // the original, which is now correct.
      console.error('[Rotate] Could not turn the preview; dropping it:', e);
      await unlink(previewPath).catch(() => {});
      previewUrl = null;
    }
  }

  const size = (await stat(rotatedPath)).size;
  const url = `/uploads/${rotatedName}`;

  /*
   * The row is read again because the preview may have been made while this was
   * working — the transcode runs in the background and takes seconds. Writing
   * the copy taken at the start would leave that file on disk with nothing
   * pointing at it.
   */
  const [latest] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (latest?.previewUrl && latest.previewUrl !== item.previewUrl) {
    await removePreview(latest.previewUrl);
    previewUrl = null;
  }

  /*
   * `originalUrl` follows only when it pointed at the same file — which it does
   * for every upload, since there is no separate optimised rendition. If it
   * ever points elsewhere, that elsewhere is not what was just rotated.
   */
  const originalUrl = item.originalUrl === item.url ? url : item.originalUrl;

  await db
    .update(media)
    .set({
      url,
      originalUrl,
      thumbnailUrl,
      previewUrl,
      width: after.width,
      height: after.height,
      size,
      originalSize: item.originalSize === item.size ? size : item.originalSize
    })
    .where(eq(media.id, mediaId));

  // Only once the row points at the new file: an interruption before this
  // leaves the old one in place, which is the safe way to fail.
  await unlink(current).catch(() => {});
  if (thumbnailName && item.thumbnailUrl && item.thumbnailUrl !== thumbnailUrl) {
    await unlink(mediaPath(item.thumbnailUrl)).catch(() => {});
  }

  /*
   * If there's no preview now, ask for one.
   *
   * Covers three cases that all look the same from here: the file was rotated
   * before its preview had finished being made, the turn failed and the stale
   * one was dropped, or it never had one. Rotating right after uploading is the
   * likely sequence — you notice it's sideways the moment you see it — so this
   * is the common path, not the edge.
   *
   * Cheap to be wrong about: making one is skipped outright when the row
   * already has it.
   */
  if (!previewUrl) queuePreviewRendition(mediaId);

  return { ok: true, rotation: next };
}
