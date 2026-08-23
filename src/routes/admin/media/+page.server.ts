import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tagsForMany, listTags } from '$lib/server/tags';
import { media, profile, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async ({ request }) => {
  // Verify admin role - only admins can manage media
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  // Get settings for press kit
  const [settingsData] = await db.select().from(settings).limit(1);
  const pressKitMediaIds: number[] = (settingsData?.pressKitMediaIds ?? []) as number[];
  const clipGraphicsMediaIds: number[] = (settingsData?.clipGraphicsMediaIds ?? []) as number[];

  // Check if press kit zip exists
  const pressKitZipPath = join(process.cwd(), 'data', 'uploads', 'press-kit.zip');
  const pressKitZipExists = existsSync(pressKitZipPath);

  // Get profile for bio
  const [profileData] = await db.select().from(profile).limit(1);

  // One query for the grid rather than a lookup per tile.
  const tagsByMedia = await tagsForMany(
    'media',
    allMedia.map((m) => m.id)
  );

  return {
    media: allMedia,
    tagsByMedia: Object.fromEntries(
      [...tagsByMedia].map(([id, list]) => [id, list.map((t) => t.name)])
    ) as Record<number, string[]>,
    allTags: (await listTags()).map((t) => t.name),
    pressKitMediaIds,
    clipGraphicsMediaIds,
    pressKitZipExists,
    bio: profileData?.bio || null,
    artistName: profileData?.name || 'Artist',
    pressKitEnabled: settingsData?.pressKitEnabled ?? false,
    clipsEnabled: settingsData?.clipsEnabled ?? false,
    defaultClipGraphicMediaId: settingsData?.defaultClipGraphicMediaId ?? null
  };
};
