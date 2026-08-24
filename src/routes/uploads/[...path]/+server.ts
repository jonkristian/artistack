import { error } from '@sveltejs/kit';
import { stat } from 'fs/promises';
import { join, normalize } from 'path';
import type { RequestHandler } from './$types';
import { UPLOAD_DIR } from '$lib/server/paths';
import { serveFile } from '$lib/server/serve-file';

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

  return serveFile(filePath, request, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }
  });
};
