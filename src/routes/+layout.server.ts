import { db } from '$lib/server/db';
import { profile, settings, links, tourDates, blocks, media } from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { eq, asc } from 'drizzle-orm';
import { ensureBlocksExist } from '$lib/server/setup';

// Track if setup has been run
let setupComplete = false;

export async function load({ request }) {
  // Ensure blocks exist (only runs once on first request)
  if (!setupComplete) {
    await ensureBlocksExist();
    setupComplete = true;
  }

  const session = await auth.api.getSession({ headers: request.headers });

  const [artistProfile] = await db.select().from(profile).limit(1);
  const [siteSettings] = await db.select().from(settings).limit(1);
  const artistLinks = await db
    .select()
    .from(links)
    .where(eq(links.visible, true))
    .orderBy(asc(links.position));
  const artistTourDates = await db.select().from(tourDates).orderBy(asc(tourDates.date));
  const allBlocks = await db.select().from(blocks).orderBy(asc(blocks.position));
  const allMedia = await db.select().from(media);

  return {
    profile: artistProfile ?? null,
    settings: siteSettings ?? null,
    links: artistLinks,
    tourDates: artistTourDates,
    blocks: allBlocks,
    media: allMedia,
    user: session?.user ?? null
  };
}
