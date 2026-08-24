import { error, json } from '@sveltejs/kit';
import { appendFile, mkdir, stat, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { join } from 'path';
import { UPLOAD_DIR } from '$lib/server/paths';
import { finalizeUpload } from '$lib/server/finalize-upload';
import { finalizeSessionUpload } from '$lib/server/upload-session';
import { requireUploadAccess } from '$lib/server/api';
import type { RequestHandler } from './$types';

/**
 * Chunked upload, for files too large to send in one request.
 *
 * Exists because a reverse proxy in front of the app can cap request bodies
 * well below the file size — Cloudflare's proxy allows 100MB on its lower
 * plans, which a minute of phone video exceeds. Sending the file as a series of
 * small requests sidesteps that entirely, and is what Seafile and every other
 * large-file uploader does for the same reason.
 *
 *   POST /api/upload/chunk?uploadId=<id>&index=<n>&total=<m>&filename=<name>
 *
 * Chunks must arrive in order — the body is appended to one part file. The
 * client sends them sequentially, which costs nothing on an upload that is
 * bandwidth-bound anyway, and avoids tracking which offsets have landed.
 */

const MAX_TOTAL_SIZE = 500 * 1024 * 1024;
const CHUNK_DIR = join(UPLOAD_DIR, '.chunks');

export const POST: RequestHandler = async ({ request, url }) => {
  const uploadId = url.searchParams.get('uploadId') ?? '';
  const index = Number(url.searchParams.get('index'));
  const total = Number(url.searchParams.get('total'));

  // The id becomes a filename, so it must not be able to escape the directory.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId)) throw error(400, 'Invalid uploadId');
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total) {
    throw error(400, 'Invalid chunk index');
  }

  // Same gate as the single-request upload: an admin session, or a valid
  // phone-upload token.
  const uploadSession = await requireUploadAccess(request, url);

  await mkdir(CHUNK_DIR, { recursive: true });
  const partPath = join(CHUNK_DIR, `${uploadId}.part`);

  // A first chunk that isn't index 0 means a retry against a stale part file.
  if (index === 0) await unlink(partPath).catch(() => {});

  const existing = (await stat(partPath).catch(() => null))?.size ?? 0;
  if (index > 0 && existing === 0) throw error(409, 'No upload in progress for that id');

  const body = request.body;
  if (!body) throw error(400, 'Missing body');

  // Cap on the way in, so a client ignoring the limit can't fill the disk.
  let received = existing;
  const guard = async function* () {
    for await (const chunk of Readable.fromWeb(body as never)) {
      received += (chunk as Buffer).length;
      if (received > MAX_TOTAL_SIZE) {
        await unlink(partPath).catch(() => {});
        throw error(400, `File too large. Maximum size is ${MAX_TOTAL_SIZE / 1024 / 1024}MB`);
      }
      yield chunk as Buffer;
    }
  };

  for await (const chunk of guard()) {
    await appendFile(partPath, chunk);
  }

  // More to come: acknowledge and wait for the next one.
  if (index < total - 1) {
    return json({ received, complete: false });
  }

  const baseFilename = `media-${Date.now()}`;
  const result = await finalizeUpload(partPath, baseFilename, url.searchParams.get('filename'));

  // A token upload has no authenticated client to register the media row, so
  // it's recorded here — and appended to the clip the QR was made from.
  if (uploadSession) await finalizeSessionUpload(uploadSession, result);

  return json(result);
};
