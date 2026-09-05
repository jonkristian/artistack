import { tagsForMany } from '$lib/server/tags';
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
  pages,
  products,
  releases
} from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { eq, asc, desc, and, isNull, isNotNull } from 'drizzle-orm';
import { findCart, getCartLines, cartTotal } from '$lib/server/cart';
import { ensureBlocksExist } from '$lib/server/setup';
import { getMetaSettings, getTiktokSettings, getSettings } from '$lib/server/settings';

// Track if setup has been run
let setupComplete = false;

export async function load({ request, cookies }) {
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

  /*
   * The shop, for any page carrying a shop block. Skipped entirely when the
   * shop is off, so a site that doesn't sell anything doesn't pay for a query
   * and a cart lookup on every request.
   *
   * The existing cart only — never created here. Making one to render a page
   * would set a cookie for every visitor who never buys anything.
   */
  const shopProducts = siteSettings?.shopEnabled
    ? await db
        .select()
        .from(products)
        .where(eq(products.visible, true))
        .orderBy(asc(products.position))
    : [];

  /*
   * With their tags, which is what a shop block filters on. A second query
   * rather than a join, because `taggings` is polymorphic and has nothing to
   * join through.
   */
  const productTags = await tagsForMany(
    'product',
    shopProducts.map((p) => p.id)
  );
  const taggedProducts = shopProducts.map((p) => ({
    ...p,
    tags: productTags.get(p.id) ?? []
  }));

  /*
   * The records, for any page carrying a releases block. Newest first, which is
   * the order a discography is read in and the order the block relies on.
   *
   * Published pages only: the block links to the release page, and an unlisted
   * one is unlisted precisely so it isn't linked to yet. Skipped entirely when
   * releases are off, like the shop's query.
   */
  const releaseRows = siteSettings?.releasesEnabled
    ? await db
        .select({
          id: releases.id,
          title: releases.title,
          slug: pages.slug,
          releaseDate: releases.releaseDate,
          coverUrl: releases.coverUrl,
          presaveUrl: releases.presaveUrl
        })
        .from(releases)
        .innerJoin(pages, eq(pages.id, releases.pageId))
        .where(eq(pages.published, true))
        .orderBy(desc(releases.releaseDate))
    : [];

  /*
   * The services each record is on, so a block can offer them from the row
   * rather than by way of the release page. The same rows the release page
   * loads for itself — this is the whole set at once, which is one query
   * instead of one per record.
   *
   * Ids and marks only. The URLs stay on the server: every click goes out
   * through /go, which is what counts it.
   */
  const releaseLinks =
    releaseRows.length > 0
      ? await db
          .select({
            id: links.id,
            releaseId: links.releaseId,
            platform: links.platform,
            label: links.label
          })
          .from(links)
          .where(and(eq(links.visible, true), isNotNull(links.releaseId)))
          .orderBy(asc(links.position))
      : [];

  const siteReleases = releaseRows.map((release) => ({
    ...release,
    links: releaseLinks
      .filter((link) => link.releaseId === release.id)
      .map(({ id, platform, label }) => ({ id, platform, label }))
  }));

  const cart = siteSettings?.shopEnabled ? await findCart(cookies) : null;
  const cartLines = cart ? await getCartLines(cart.id) : [];

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
    products: taggedProducts,
    releases: siteReleases,
    cart: { lines: cartLines, total: cartTotal(cartLines) },
    user: session?.user ?? null
  };
}
