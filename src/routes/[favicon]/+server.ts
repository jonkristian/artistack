import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { RequestHandler } from './$types';

// Serve generated favicon files from data folder
const ALLOWED_FILES: Record<string, string> = {
  'apple-touch-icon.png': 'image/png',
  'favicon-16.png': 'image/png',
  'favicon-32.png': 'image/png',
  'favicon-48.png': 'image/png',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png'
};

export const GET: RequestHandler = async ({ params }) => {
  const filename = params.favicon;
  const mimeType = ALLOWED_FILES[filename];

  if (!mimeType) {
    throw error(404, 'Not found');
  }

  const filePath = `data/${filename}`;

  if (!existsSync(filePath)) {
    throw error(404, 'Favicon not generated yet');
  }

  const file = await readFile(filePath);

  return new Response(file, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
