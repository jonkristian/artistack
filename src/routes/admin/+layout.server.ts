import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
  profile,
  settings,
  links,
  shows,
  acts,
  showActs,
  media,
  blocks,
  releases,
  pages
} from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { getGoogleConfig } from '$lib/server/social-stats';
import { getSettings } from '$lib/server/settings';
import { asc, desc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    throw redirect(302, '/login');
  }

  // Get user with role from database
  const [userData] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);

  const [
    profileData,
    settingsData,
    allLinks,
    allShows,
    allActs,
    allShowActs,
    allMedia,
    allBlocks,
    googleConfig,
    allReleases,
    allPages
  ] = await Promise.all([
    db
      .select()
      .from(profile)
      .limit(1)
      .then((r) => r[0]),
    // Safe reader: layout data reaches every signed-in user, the editor role
    // included, and is serialised into the page.
    getSettings(),
    db.select().from(links).orderBy(asc(links.position)),
    db.select().from(shows).orderBy(asc(shows.date)),
    db.select().from(acts).orderBy(asc(acts.name)),
    db.select().from(showActs).orderBy(asc(showActs.position)),
    db.select().from(media).orderBy(desc(media.createdAt)),
    db.select().from(blocks).orderBy(asc(blocks.position)),
    getGoogleConfig(),
    /*
     * Releases are loaded here, not in the route, so they can live in the
     * same draft as the page and be committed by the same Update button.
     * Flattened across the two tables because the split between a release
     * and its page is an implementation detail the editor shouldn't carry.
     */
    db
      .select({
        id: releases.id,
        pageId: pages.id,
        title: releases.title,
        slug: pages.slug,
        description: pages.description,
        shareImageUrl: pages.shareImageUrl,
        published: pages.published,
        releaseDate: releases.releaseDate,
        coverUrl: releases.coverUrl,
        presaveUrl: releases.presaveUrl,
        isrc: releases.isrc,
        upc: releases.upc
      })
      .from(releases)
      .innerJoin(pages, eq(pages.id, releases.pageId))
      .orderBy(desc(releases.releaseDate)),
    /*
     * Every page, for the Pages list and so an editor knows which page it's
     * editing. Loaded here rather than per route: the layout's copy is what
     * the draft is built from, and a route fetching its own would shadow it
     * in merged page data.
     */
    db.select().from(pages).orderBy(asc(pages.position), asc(pages.id))
  ]);

  return {
    user: {
      ...session.user,
      role: userData?.role ?? 'editor'
    },
    profile: profileData ?? null,
    settings: settingsData ?? null,
    links: allLinks,
    /*
     * Shows carry their line-up flattened onto them, in running order. The
     * join is how it's stored; it isn't something the editor should have to
     * assemble, so one diff decides what to write to both.
     */
    shows: allShows.map((show) => ({
      ...show,
      lineup: allShowActs
        .filter((sa) => sa.showId === show.id)
        .sort((a, b) => a.position - b.position)
        .map((sa) => ({ actId: sa.actId, setTime: sa.setTime }))
    })),
    acts: allActs,
    media: allMedia,
    blocks: allBlocks,
    releases: allReleases,
    pages: allPages,
    googleConfig
  };
};
