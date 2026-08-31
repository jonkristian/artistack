import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { eq } from 'drizzle-orm';
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

  const [show] = await db.select({ id: shows.id }).from(shows).where(eq(shows.id, id)).limit(1);
  if (!show) error(404, 'Show not found');

  return { showId: id };
};
