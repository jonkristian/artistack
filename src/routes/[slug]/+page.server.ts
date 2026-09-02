import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages, releases, links, blocks, shows, showActs, acts, media } from '$lib/server/schema';
import { eq, and, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

/**
 * Every page that isn't the artist page: /i-will-be-me, /shop, /about.
 *
 * `pages` says what lives at an address and whether it's live; the row's `type`
 * chooses the renderer, and the content comes from whichever table suits that
 * type. Adding a page type means adding a branch here and a component — not a
 * new route with its own publishing, SEO and admin.
 */
export const load: PageServerLoad = async ({ params, url, parent, cookies }) => {
  const [page] = await db.select().from(pages).where(eq(pages.slug, params.slug)).limit(1);

  if (!page) {
    error(404, 'Page not found');
  }

  // The artist page renders at the root. Serving it here too would give the
  // same content two addresses, which splits analytics and confuses scrapers.
  if (page.type === 'landing') {
    redirect(301, '/');
  }

  const { user, settings: siteSettings } = await parent();

  /*
   * Drafts stay reachable for whoever is logged in, so a page can be built and
   * shared internally before it goes public.
   *
   * Not a show, though. Its switch says whether the show has a landing page at
   * all, so "off but still there if you're signed in" contradicts the control —
   * and the editor has a live preview pane, so there's nothing to visit the
   * real URL for.
   */
  if (!page.published && (!user || page.type === 'show')) {
    error(404, 'Page not found');
  }

  /**
   * og:image has to be absolute — a relative path is ignored by every scraper.
   * Built from the request origin so it's right in dev, on a preview domain and
   * in production without a configured base URL.
   */
  const absolute = (path: string) => new URL(path, url.origin).href;

  const shared = {
    page,
    canonical: absolute(`/${page.slug}`)
  };

  if (page.type === 'release') {
    const [release] = await db.select().from(releases).where(eq(releases.pageId, page.id)).limit(1);

    if (!release) {
      // A release page whose row is missing can't render anything meaningful.
      error(404, 'Page not found');
    }

    const releaseLinks = await db
      .select()
      .from(links)
      .where(and(eq(links.releaseId, release.id), eq(links.visible, true)))
      .orderBy(asc(links.position));

    return {
      ...shared,
      release,
      releaseLinks,
      isOut: release.releaseDate.getTime() <= Date.now(),
      /** The service they last chose here, so their button can lead. */
      preferredPlatform: cookies.get('platform') ?? null,
      /*
       * The cover is the share image unless something better is set. Every
       * other music service does the same — Spotify and Bandcamp both serve the
       * artwork — and it means a release that has art has a link preview
       * without anyone configuring one.
       */
      shareImage: page.shareImageUrl
        ? absolute(page.shareImageUrl)
        : release.coverUrl
          ? absolute(release.coverUrl)
          : null
    };
  }

  if (page.type === 'show') {
    const [show] = await db.select().from(shows).where(eq(shows.pageId, page.id)).limit(1);

    if (!show) {
      // A show page whose row is missing can't render anything meaningful.
      error(404, 'Page not found');
    }

    /*
     * Resolved here rather than sent as ids: the page only renders them, and
     * shipping the act table so the browser could do the join would hand every
     * act on the site to every visitor.
     */
    const rows = await db
      .select({
        setTime: showActs.setTime,
        name: acts.name,
        logoUrl: acts.logoUrl,
        isSelf: acts.isSelf
      })
      .from(showActs)
      .innerJoin(acts, eq(acts.id, showActs.actId))
      .where(eq(showActs.showId, show.id))
      .orderBy(asc(showActs.position));

    /*
     * The frame the poster was cropped in, kept on the crop's own row. Looked
     * up by URL because that's all a show stores — the shape belongs to the
     * picture, not to the show using it.
     */
    const [poster] = show.imageUrl
      ? await db
          .select({ cropShape: media.cropShape })
          .from(media)
          .where(eq(media.url, show.imageUrl))
          .limit(1)
      : [];

    return {
      ...shared,
      show,
      lineup: rows,
      imageShape: poster?.cropShape ?? null,
      /*
       * The poster is the share image unless something better is set — it's
       * what the gig is advertised with, so a show that has one gets a link
       * preview without anyone configuring it.
       */
      shareImage: page.shareImageUrl
        ? absolute(page.shareImageUrl)
        : show.imageUrl
          ? absolute(show.imageUrl)
          : null
    };
  }

  if (page.type === 'shop') {
    /*
     * Switched off means gone, not just missing from the menu. The page row
     * survives being switched off so its address is still yours, but a shop
     * that renders with a basket leading nowhere is worse than a 404.
     */
    if (!siteSettings?.shopEnabled) {
      error(404, 'Page not found');
    }

    /*
     * Products and the basket come from the layout, which loads them for any
     * page that might carry a shop block. Querying them again here would be the
     * same two queries producing the same two answers.
     */
    return {
      ...shared,
      shareImage: page.shareImageUrl ? absolute(page.shareImageUrl) : null
    };
  }

  if (page.type === 'custom') {
    /*
     * The page's own blocks. The root layout supplies the profile, links and
     * tour dates — those are the site's, shared by every page — but blocks
     * belong to one page and are the whole of what makes this one different.
     */
    const pageBlocks = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.pageId, page.id), eq(blocks.visible, true)))
      .orderBy(asc(blocks.position));

    return {
      ...shared,
      blocks: pageBlocks,
      shareImage: page.shareImageUrl ? absolute(page.shareImageUrl) : null
    };
  }

  // Every type above has a renderer. Anything else is a row written by a
  // version of the app that knew how to draw it and this one doesn't.
  error(404, 'Page not found');
};
