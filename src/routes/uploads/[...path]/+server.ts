import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = 'data/uploads';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
};

export const GET: RequestHandler = async ({ params }) => {
  const filePath = join(UPLOAD_DIR, params.path);

  // Security: prevent directory traversal
  if (!filePath.startsWith(UPLOAD_DIR) || params.path.includes('..')) {
    throw error(403, 'Forbidden');
  }

  if (!existsSync(filePath)) {
    throw error(404, 'Not found');
  }

  const ext = params.path.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  const file = await readFile(filePath);

  return new Response(file, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};
