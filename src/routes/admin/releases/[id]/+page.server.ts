import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { releases, pages, links, subscribers } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { getReleaseClickStats, getPathViewStats, getActionClickCount } from '$lib/server/analytics';
import { eq, asc, isNull, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  await requireFeature(request, 'releasesEnabled');

  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Release not found');

  const [release] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  if (!release) error(404, 'Release not found');

  const [page] = await db.select().from(pages).where(eq(pages.id, release.pageId)).limit(1);
  if (!page) error(404, 'Release not found');

  const releaseLinks = await db
    .select()
    .from(links)
    .where(eq(links.releaseId, release.id))
    .orderBy(asc(links.position));

  const [clicks, pageViews, presaves] = await Promise.all([
    getReleaseClickStats(release.id),
    getPathViewStats(`/${page.slug}`),
    getActionClickCount('presave', release.id)
  ]);

  /*
   * How many people an announcement would actually reach, so the confirmation
   * can say a number rather than "the fan list" — the difference between
   * pressing that button carefully and pressing it casually.
   */
  const [{ total: subscriberCount } = { total: 0 }] = await db
    .select({ total: count() })
    .from(subscribers)
    .where(isNull(subscribers.unsubscribedAt));

  // Media isn't fetched here: the admin layout already loads the library, and
  // MediaPicker takes it straight from there.
  return { release, page, releaseLinks, clicks, pageViews, presaves, subscriberCount };
};
