import { error } from '@sveltejs/kit';
import { open, rename, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { UPLOAD_DIR, THUMBNAIL_SIZE } from './paths';
import {
  probeVideo,
  probeDuration,
  extractPosterFrame,
  detectMediaType,
  MEDIA_HEADER_BYTES
} from './ffmpeg';

const ACCEPTED = 'MP4, MOV, WebM, WAV, MP3, M4A, FLAC, OGG';

export interface UploadResult {
  filename: string;
  url: string;
  originalUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs: number;
  size: number;
  originalSize: number;
  mimeType: string;
}

/**
 * Turns a completed `.part` file into a usable media file.
 *
 * Shared by the single-request stream upload and the chunked one: both end with
 * the same bytes on disk under a temp name, and everything after that — sniff
 * the container, name it, probe it, make a poster — is identical. Keeping one
 * copy means a chunked upload can't quietly produce a differently-shaped result.
 *
 * The type is read back off disk rather than tracked while writing, so it works
 * the same whether the bytes arrived in one request or forty.
 */
export async function finalizeUpload(
  tempPath: string,
  baseFilename: string,
  originalName?: string | null
): Promise<UploadResult> {
  const handle = await open(tempPath, 'r');
  const header = Buffer.alloc(MEDIA_HEADER_BYTES);
  try {
    await handle.read(header, 0, MEDIA_HEADER_BYTES, 0);
  } finally {
    await handle.close();
  }

  const mediaType = detectMediaType(header);
  if (!mediaType) {
    await unlink(tempPath).catch(() => {});
    throw error(400, `Invalid file content. Allowed: ${ACCEPTED}`);
  }

  const filename = `${baseFilename}.${mediaType.ext}`;
  const finalPath = join(UPLOAD_DIR, filename);
  await rename(tempPath, finalPath);

  let width: number | undefined;
  let height: number | undefined;
  let duration: number;
  let thumbnailUrl: string | undefined;

  // If this fails the file isn't usable, so don't leave it orphaned.
  try {
    if (mediaType.kind === 'video') {
      const metadata = await probeVideo(finalPath);
      width = metadata.width;
      height = metadata.height;
      duration = metadata.duration;

      const poster = await extractPosterFrame(finalPath, duration);
      const thumbnailBuffer = await sharp(poster)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const thumbnailFilename = `${baseFilename}-thumb.webp`;
      await writeFile(join(UPLOAD_DIR, thumbnailFilename), thumbnailBuffer);
      thumbnailUrl = `/uploads/${thumbnailFilename}`;
    } else {
      // Audio has no frame to grab; the UI renders an icon instead.
      duration = await probeDuration(finalPath);
    }
  } catch (e) {
    await unlink(finalPath).catch(() => {});
    console.error('[Upload] Processing failed:', e);
    throw error(400, `Could not read this ${mediaType.kind} file`);
  }

  const size = (await stat(finalPath)).size;

  return {
    filename: originalName || filename,
    url: `/uploads/${filename}`,
    // No separate "optimized" rendition — the upload is the original.
    originalUrl: `/uploads/${filename}`,
    thumbnailUrl,
    width,
    height,
    durationMs: Math.round(duration * 1000),
    size,
    originalSize: size,
    mimeType: mediaType.mime
  };
}
