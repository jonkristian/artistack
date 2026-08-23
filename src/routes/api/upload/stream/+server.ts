import { json, error } from '@sveltejs/kit';
import { requireUploadAccess } from '$lib/server/api';
import { finalizeSessionUpload } from '$lib/server/upload-session';
import { mkdir, unlink, stat, open, rename, writeFile } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import sharp from 'sharp';
import {
  probeVideo,
  probeDuration,
  extractPosterFrame,
  videoSupported,
  detectMediaType,
  MEDIA_HEADER_BYTES,
  type DetectedType
} from '$lib/server/ffmpeg';
import type { RequestHandler } from './$types';
import { UPLOAD_DIR, THUMBNAIL_SIZE } from '$lib/server/paths';

// These are streamed straight to disk rather than buffered, so the caps are
// about keeping the library sane, not about memory pressure.
const MAX_SIZE: Record<DetectedType['kind'], number> = {
  video: 500 * 1024 * 1024,
  audio: 100 * 1024 * 1024
};
const MAX_ANY_SIZE = Math.max(...Object.values(MAX_SIZE));

const ACCEPTED = 'MP4, MOV, WebM, WAV, MP3, M4A, FLAC, OGG';

/**
 * Streams a video or audio upload to disk and derives its metadata.
 *
 * Separate from the image upload route on purpose: images are small enough to
 * buffer and need sharp's full pipeline, while a 500MB clip must never be held
 * in memory. The client picks the route based on the file's type.
 *
 * The raw file is sent as the request body (not multipart) so it can be piped
 * straight through; the original name travels in the `filename` query param.
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const uploadSession = await requireUploadAccess(request, url);

  if (!(await videoSupported())) {
    throw error(503, 'Video and audio support requires ffmpeg and ffprobe on the server.');
  }

  if (!request.body) {
    throw error(400, 'No file provided');
  }

  // Reject oversized uploads before reading a byte, when the client declares a
  // length. The per-kind cap is applied once the type is known.
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_ANY_SIZE) {
    throw error(400, `File too large. Maximum size is ${MAX_ANY_SIZE / 1024 / 1024}MB`);
  }

  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const baseFilename = `media-${timestamp}`;

  // The container type isn't known until the first bytes arrive, so write to a
  // temp name and rename once detected.
  const tempPath = join(UPLOAD_DIR, `${baseFilename}.part`);

  const source = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);

  // Guard the stream as it passes through: reject an unsupported file as soon as
  // the header is readable, and enforce the size cap for clients that lied about
  // (or omitted) Content-Length. The authoritative type read happens after the
  // write, off the file itself.
  async function* guard(chunks: AsyncIterable<Buffer>) {
    let head = Buffer.alloc(0);
    let limit = MAX_ANY_SIZE;
    let checked = false;
    let bytesWritten = 0;

    for await (const chunk of chunks) {
      if (!checked) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= MEDIA_HEADER_BYTES) {
          checked = true;
          const type = detectMediaType(head);
          if (!type) {
            throw error(400, `Invalid file content. Allowed: ${ACCEPTED}`);
          }
          limit = MAX_SIZE[type.kind];
        }
      }

      bytesWritten += chunk.length;
      if (bytesWritten > limit) {
        throw error(400, `File too large. Maximum size is ${limit / 1024 / 1024}MB`);
      }

      yield chunk;
    }
  }

  try {
    await pipeline(source, guard, createWriteStream(tempPath));
  } catch (e) {
    await unlink(tempPath).catch(() => {});
    // Re-throw SvelteKit HttpErrors untouched; wrap anything else.
    if (e && typeof e === 'object' && 'status' in e) throw e;
    console.error('[Upload:stream] Write failed:', e);
    throw error(500, 'Failed to save uploaded file');
  }

  // Read the container type back off disk rather than out of the guard closure —
  // one source of truth, and it also catches a file too short to ever be checked.
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

  // Probe (and for video, poster-frame). If this fails the file isn't usable, so
  // don't leave it orphaned in the uploads dir.
  let width: number | undefined;
  let height: number | undefined;
  let duration: number;
  let thumbnailUrl: string | undefined;

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
    console.error('[Upload:stream] Processing failed:', e);
    throw error(400, `Could not read this ${mediaType.kind} file`);
  }

  const size = (await stat(finalPath)).size;

  const result = {
    filename: url.searchParams.get('filename') || filename,
    url: `/uploads/${filename}`,
    // No separate "optimized" rendition here — the upload is the original.
    originalUrl: `/uploads/${filename}`,
    thumbnailUrl,
    width,
    height,
    durationMs: Math.round(duration * 1000),
    size,
    originalSize: size,
    mimeType: mediaType.mime
  };

  // A token upload has no authenticated client to register the media row, so
  // it's recorded here — and appended to the clip project when the QR was made
  // from one.
  if (uploadSession) await finalizeSessionUpload(uploadSession, result);

  return json(result);
};
