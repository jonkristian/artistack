import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pages, releases, links } from '$lib/server/schema';
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

  const { user } = await parent();

  // Drafts stay reachable for whoever is logged in, so a page can be built and
  // shared internally before it goes public.
  if (!page.published && !user) {
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

  // 'shop' and 'custom' have no renderer yet. A row can exist — the admin can
  // create one — but until something can draw it, it isn't a public page.
  error(404, 'Page not found');
};
