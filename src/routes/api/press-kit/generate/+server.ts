import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { media, profile, links, settings } from '$lib/server/schema';
import { eq, asc, inArray, and } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { user } from '$lib/server/auth-schema';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

export const POST: RequestHandler = async ({ request }) => {
  // Verify admin role
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse bio option from request body
  let includeBio = true;
  try {
    const body = await request.json();
    includeBio = body.includeBio ?? true;
  } catch {
    // No body or invalid JSON, use defaults
  }

  // Get press kit media IDs from settings
  const [settingsData] = await db.select().from(settings).limit(1);
  const mediaIds: number[] = (settingsData?.pressKitMediaIds ?? []) as number[];

  if (mediaIds.length === 0) {
    return json({ error: 'Press kit is empty' }, { status: 400 });
  }

  // Fetch media items (prefer original files for full quality)
  const items = await db.select().from(media).where(inArray(media.id, mediaIds));

  if (items.length === 0) {
    return json({ error: 'Press kit is empty' }, { status: 400 });
  }

  // Get profile for bio
  const [profileData] = await db.select().from(profile).limit(1);
  const artistName = profileData?.name || 'Artist';

  // Ensure output directory exists (use data/uploads like other uploads)
  const outputDir = join(process.cwd(), 'data', 'uploads');
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, 'press-kit.zip');

  // Fetch social links for bio.txt (must be done before entering Promise callback)
  const socialLinks = includeBio
    ? await db
        .select()
        .from(links)
        .where(and(eq(links.category, 'social'), eq(links.visible, true)))
        .orderBy(asc(links.position))
    : [];

  // Create ZIP archive
  return new Promise((resolve) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve(
        json({
          success: true,
          url: '/uploads/press-kit.zip',
          size: archive.pointer()
        })
      );
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      resolve(json({ error: 'Failed to create archive' }, { status: 500 }));
    });

    archive.pipe(output);

    // Add bio.txt if requested
    if (includeBio) {
      const bioLines: string[] = [];

      // Artist name
      if (artistName) {
        bioLines.push(artistName);
        bioLines.push('='.repeat(artistName.length));
        bioLines.push('');
      }

      // Bio text
      if (profileData?.bio) {
        bioLines.push(profileData.bio);
        bioLines.push('');
      }

      // Email
      if (profileData?.email) {
        bioLines.push(`Email: ${profileData.email}`);
        bioLines.push('');
      }

      // Social links
      if (socialLinks.length > 0) {
        bioLines.push('Social Media');
        bioLines.push('-'.repeat(12));
        for (const link of socialLinks) {
          const label =
            link.label || link.platform.charAt(0).toUpperCase() + link.platform.slice(1);
          bioLines.push(`${label}: ${link.url}`);
        }
      }

      if (bioLines.length > 0) {
        archive.append(bioLines.join('\n'), { name: 'bio.txt' });
      }
    }

    // Add each media file (use original when available for full quality)
    // Maintain the order from mediaIds
    let index = 1;
    for (const id of mediaIds) {
      const item = items.find((m) => m.id === id);
      if (!item) continue;

      try {
        // Prefer original file, fall back to optimized version
        const fileUrl = item.originalUrl || item.url;
        const filePath = join(process.cwd(), 'data', fileUrl);
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
