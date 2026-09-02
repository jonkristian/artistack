import { error } from '@sveltejs/kit';
import { stat } from 'fs/promises';
import { join, normalize } from 'path';
import type { RequestHandler } from './$types';
import { UPLOAD_DIR } from '$lib/server/paths';
import { serveFile } from '$lib/server/serve-file';
import { isPaidFile } from '$lib/server/shop';
import { auth } from '$lib/server/auth';

export const GET: RequestHandler = async ({ params, request }) => {
  // Security: resolve first, then confirm the result is still inside UPLOAD_DIR.
  // Checking the raw param would miss encoded or nested traversal sequences.
  const filePath = normalize(join(UPLOAD_DIR, params.path));
  if (!filePath.startsWith(normalize(UPLOAD_DIR) + '/')) {
    throw error(403, 'Forbidden');
  }

  if (!(await stat(filePath).catch(() => null))) {
    throw error(404, 'Not found');
  }

  /*
   * A file someone has to buy isn't served from here, even though it lives in
   * the same directory. Otherwise the public URL would be the easy way to get
   * it and the download token would be decoration.
   *
   * Signed in is the exception: whoever runs the shop has to be able to see
   * what they're selling, and without this the media library shows a broken
   * thumbnail for every download on it. The session is only looked up once a
   * file turns out to be gated, so the common case stays one query.
   */
  if (await isPaidFile(`/uploads/${params.path}`)) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      throw error(404, 'Not found');
    }
  }

  return serveFile(filePath, request, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }
  });
};
