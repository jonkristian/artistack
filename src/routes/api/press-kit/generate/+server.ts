import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { media, settings } from '$lib/server/schema';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { user } from '$lib/server/auth-schema';
import { ZipArchive, type ArchiverError } from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { getSettings } from '$lib/server/settings';
import { mediaPath } from '$lib/server/paths';

export const POST: RequestHandler = async ({ request }) => {
  // Editors curate the press kit in Media, so they can build it too.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get press kit media IDs from settings
  const settingsData = await getSettings();
  const mediaIds: number[] = (settingsData?.pressKitMediaIds ?? []) as number[];

  if (mediaIds.length === 0) {
    return json({ error: 'Press kit is empty' }, { status: 400 });
  }

  // Fetch media items (prefer original files for full quality)
  const items = await db.select().from(media).where(inArray(media.id, mediaIds));

  if (items.length === 0) {
    return json({ error: 'Press kit is empty' }, { status: 400 });
  }

  // Ensure output directory exists (use data/uploads like other uploads)
  const outputDir = join(process.cwd(), 'data', 'uploads');
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'press-kit.zip');

  // Create ZIP archive
  return new Promise((resolve) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
      resolve(
        json({
          success: true,
          url: '/uploads/press-kit.zip',
          size: archive.pointer()
        })
      );
    });

    archive.on('error', (err: ArchiverError) => {
      console.error('Archive error:', err);
      resolve(json({ error: 'Failed to create archive' }, { status: 500 }));
    });

    archive.pipe(output);

    // Add each media file (use original when available for full quality)
    // Maintain the order from mediaIds
    let index = 1;
    for (const id of mediaIds) {
      const item = items.find((m) => m.id === id);
      if (!item) continue;

      try {
        /*
         * Prefer original file, fall back to optimized version. Resolved
         * through `mediaPath`, which refuses anything outside the uploads
         * directory — the finished zip is served from a public URL, so a row
         * pointing at `../.env` would have been a way to read it.
         */
        const filePath = mediaPath(item.originalUrl || item.url);
        const paddedIndex = String(index).padStart(2, '0');
        const fileName = `${paddedIndex}-${item.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        archive.file(filePath, { name: fileName });
        index++;
      } catch (err) {
        console.error(`Failed to add file ${item.filename}:`, err);
      }
    }

    archive.finalize();
  });
};
