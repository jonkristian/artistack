import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { tagsForMany, listTags } from '$lib/server/tags';
import { media, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  // Get settings for press kit
  const [settingsData] = await db.select().from(settings).limit(1);
  const pressKitMediaIds: number[] = (settingsData?.pressKitMediaIds ?? []) as number[];
  const clipGraphicsMediaIds: number[] = (settingsData?.clipGraphicsMediaIds ?? []) as number[];

  // Check if press kit zip exists
  const pressKitZipPath = join(process.cwd(), 'data', 'uploads', 'press-kit.zip');
  const pressKitZipExists = existsSync(pressKitZipPath);

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
    pressKitEnabled: settingsData?.pressKitEnabled ?? false,
    clipsEnabled: settingsData?.clipsEnabled ?? false,
    defaultClipGraphicMediaId: settingsData?.defaultClipGraphicMediaId ?? null
  };
};
