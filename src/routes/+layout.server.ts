import { db } from '$lib/server/db';
import {
  profile,
  settings,
  links,
  shows,
  acts,
  showActs,
  blocks,
  media,
  pages
} from '$lib/server/schema';
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
  const artistShows = await db.select().from(shows).orderBy(asc(shows.date));

  /*
   * Line-ups resolved to names and logos here rather than sent as ids: the
   * page only ever renders them, and shipping the whole act table so the
   * browser can do the join would send every act on the site to every visitor.
   */
  const allActs = await db.select().from(acts);
  const allShowActs = await db.select().from(showActs).orderBy(asc(showActs.position));
  const actsById = new Map(allActs.map((a) => [a.id, a]));

  const showsWithLineup = artistShows.map((show) => ({
    ...show,
    lineup: allShowActs
      .filter((sa) => sa.showId === show.id)
      .sort((a, b) => a.position - b.position)
      .map((sa) => ({ setTime: sa.setTime, act: actsById.get(sa.actId) }))
      .filter((row): row is { setTime: string | null; act: (typeof allActs)[number] } => !!row.act)
      .map(({ setTime, act }) => ({
        name: act.name,
        logoUrl: act.logoUrl,
        isSelf: act.isSelf,
        setTime
      }))
  }));
  /*
   * The artist page's blocks, not every block in the table. Ordinary pages own
   * blocks too, and an unscoped read put them on the front page as well —
   * which only stayed invisible while the artist page was the one page that
   * had any.
   */
  const [landing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.type, 'landing'))
    .limit(1);
  const allBlocks = landing
    ? await db
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, landing.id))
        .orderBy(asc(blocks.position))
    : [];
  const allMedia = await db.select().from(media);

  return {
    profile: artistProfile ?? null,
    settings: siteSettings ?? null,
    pixels: siteSettings?.pixelsEnabled
      ? { metaPixelId: meta?.pixelId ?? null, tiktokPixelId: tiktok?.pixelId ?? null }
      : null,
    links: artistLinks,
    shows: showsWithLineup,
    blocks: allBlocks,
    media: allMedia,
    user: session?.user ?? null
  };
}
