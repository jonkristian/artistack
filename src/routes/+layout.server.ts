import { db } from '$lib/server/db';
import { profile, settings, links, tourDates, blocks, media } from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { eq, asc, and, isNull } from 'drizzle-orm';
import { ensureBlocksExist } from '$lib/server/setup';
import { getMetaSettings, getTiktokSettings, getSettings } from '$lib/server/settings';

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
  /*
   * The whole row. `settings` holds no credentials since the split — site
   * identity, theme and feature flags — so there is nothing here to withhold.
   *
   * Pixel ids come from their own table because they render into the page.
   */
  const siteSettings = await getSettings();
  const [meta, tiktok] = await Promise.all([getMetaSettings(), getTiktokSettings()]);
  // Block-owned links only. Release links live in the same table and are loaded
  // by the release page itself — without this filter they'd surface on the home
  // page as loose buttons with no context.
  const artistLinks = await db
    .select()
    .from(links)
    .where(and(eq(links.visible, true), isNull(links.releaseId)))
    .orderBy(asc(links.position));
  const artistTourDates = await db.select().from(tourDates).orderBy(asc(tourDates.date));
  const allBlocks = await db.select().from(blocks).orderBy(asc(blocks.position));
  const allMedia = await db.select().from(media);

  return {
    profile: artistProfile ?? null,
    settings: siteSettings ?? null,
    pixels: siteSettings?.pixelsEnabled
      ? { metaPixelId: meta?.pixelId ?? null, tiktokPixelId: tiktok?.pixelId ?? null }
      : null,
    links: artistLinks,
    tourDates: artistTourDates,
    blocks: allBlocks,
    media: allMedia,
    user: session?.user ?? null
  };
}
