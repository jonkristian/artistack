import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { profile, settings, links, tourDates, media, blocks } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { getGoogleConfig } from '$lib/server/social-stats';
import { asc, desc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    throw redirect(302, '/login');
  }

  // Get user with role from database
  const [userData] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);

  const [profileData, settingsData, allLinks, allTourDates, allMedia, allBlocks, googleConfig] =
    await Promise.all([
      db
        .select()
        .from(profile)
        .limit(1)
        .then((r) => r[0]),
      db
        .select()
        .from(settings)
        .limit(1)
        .then((r) => r[0]),
      db.select().from(links).orderBy(asc(links.position)),
      db.select().from(tourDates).orderBy(asc(tourDates.date)),
      db.select().from(media).orderBy(desc(media.createdAt)),
      db.select().from(blocks).orderBy(asc(blocks.position)),
      getGoogleConfig()
    ]);

  return {
    user: {
      ...session.user,
      role: userData?.role ?? 'editor'
    },
    profile: profileData ?? null,
    settings: settingsData ?? null,
    links: allLinks,
    tourDates: allTourDates,
    media: allMedia,
    blocks: allBlocks,
    googleConfig
  };
};
