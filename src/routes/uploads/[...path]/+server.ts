import { error } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { join, normalize } from 'path';
import type { RequestHandler } from './$types';
import { UPLOAD_DIR } from '$lib/server/paths';

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

/** Formats served as byte ranges so players can seek without downloading everything. */
const RANGE_TYPES = new Set(['mp4', 'mov', 'webm', 'wav', 'mp3', 'm4a', 'flac', 'ogg']);

export const GET: RequestHandler = async ({ params, request }) => {
  // Security: resolve first, then confirm the result is still inside UPLOAD_DIR.
  // Checking the raw param would miss encoded or nested traversal sequences.
  const filePath = normalize(join(UPLOAD_DIR, params.path));
  if (!filePath.startsWith(normalize(UPLOAD_DIR) + '/')) {
    throw error(403, 'Forbidden');
  }

  if (!existsSync(filePath)) {
    throw error(404, 'Not found');
  }

  const ext = params.path.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = 'public, max-age=31536000, immutable';

  // Images are small and fine to read whole.
  if (!RANGE_TYPES.has(ext)) {
    const file = await readFile(filePath);
    return new Response(file, {
      headers: { 'Content-Type': mimeType, 'Cache-Control': cacheControl }
    });
  }

  const { size } = await stat(filePath);
  const range = request.headers.get('range');

  // No Range header: advertise support and stream the whole file. Streaming
  // rather than readFile matters here — a 500MB clip must not land in memory.
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl
      }
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` }
    });
  }

  const [, startRaw, endRaw] = match;

  let start: number;
  let end: number;
  if (startRaw === '') {
    // Suffix form ("bytes=-N"): the last N bytes.
    const suffixLength = Number(endRaw);
    if (!suffixLength) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
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
        'Cache-Control': cacheControl
      }
    }
  );
};
