import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, pages } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { eq } from 'drizzle-orm';
import { getActionClickCount, getPathViewStats } from '$lib/server/analytics';
import type { PageServerLoad } from './$types';

/**
 * Only the id is returned. The show itself comes from the layout's copy, which
 * is what the draft is built from — loading the row again here would show
 * saved values next to an editor showing unsaved ones.
 *
 * Media isn't fetched either: the admin layout already loads the library, and
 * MediaPicker takes it straight from there.
 */
export const load: PageServerLoad = async ({ request, params }) => {
  await requireFeature(request, 'showsEnabled');

  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Show not found');

  const [show] = await db
    .select({ id: shows.id, pageId: shows.pageId })
    .from(shows)
    .where(eq(shows.id, id))
    .limit(1);
  if (!show) error(404, 'Show not found');

  // Counts, not rows: the one thing here that isn't the draft's to edit.
  const [page] = show.pageId
    ? await db.select({ slug: pages.slug }).from(pages).where(eq(pages.id, show.pageId)).limit(1)
    : [];
  const [ticketClicks, pageViews] = await Promise.all([
    getActionClickCount('tickets', id),
    page ? getPathViewStats(`/${page.slug}`).then((s) => s.views) : Promise.resolve(0)
  ]);

  return { showId: id, ticketClicks, pageViews };
};
