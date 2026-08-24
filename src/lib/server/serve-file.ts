import { readFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';

/**
 * Serving a file off disk, with byte ranges where a player needs them.
 *
 * Extracted so the preview route can reuse it rather than reimplementing range
 * parsing — two copies of "which bytes did they ask for" is exactly the kind of
 * thing that drifts and then only breaks when someone scrubs a video.
 */

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg'
};

export function mimeTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/** Time-based media, where seeking without downloading everything matters. */
function isRangeable(mimeType: string): boolean {
  return mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}

export interface ServeOptions {
  /** Merged into every response — cache policy, robots directives, and so on. */
  headers?: Record<string, string>;
}

export async function serveFile(
  filePath: string,
  request: Request,
  options: ServeOptions = {}
): Promise<Response> {
  const mimeType = mimeTypeFor(filePath);
  const extra = options.headers ?? {};

  // Images are small enough to read whole.
  if (!isRangeable(mimeType)) {
    const file = await readFile(filePath);
    return new Response(new Uint8Array(file), {
      headers: { 'Content-Type': mimeType, ...extra }
    });
  }

  const { size } = await stat(filePath);
  const range = request.headers.get('range');
  const unsatisfiable = () =>
    new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, ...extra } });

  // No Range header: advertise support and stream the whole file. Streaming
  // rather than readFile matters — a 500MB clip must not land in memory.
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        ...extra
      }
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return unsatisfiable();

  const [, startRaw, endRaw] = match;

  let start: number;
  let end: number;
  if (startRaw === '') {
    // Suffix form ("bytes=-N"): the last N bytes.
    const suffixLength = Number(endRaw);
    if (!suffixLength) return unsatisfiable();
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return unsatisfiable();
  }

  return new Response(
    Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
    {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        ...extra
      }
    }
  );
}
