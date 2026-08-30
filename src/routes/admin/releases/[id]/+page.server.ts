import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { releases, pages, links } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { getReleaseClickStats } from '$lib/server/analytics';
import { eq, asc } from 'drizzle-orm';
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

  const clicks = await getReleaseClickStats(release.id);

  // Media isn't fetched here: the admin layout already loads the library, and
  // MediaPicker takes it straight from there.
  return { release, page, releaseLinks, clicks };
};
