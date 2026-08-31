import { requireUser } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The front page has its own address in the admin rather than being reached by
 * id through Pages. It's the screen that gets opened most, and it's a singleton
 * — there is exactly one and it can't be deleted — so it reads as its own
 * section rather than as a row in a list.
 */
export const load: PageServerLoad = async () => {
  await requireUser();

  const [landing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.type, 'landing'))
    .limit(1);

  if (!landing) {
    error(500, 'The site has no front page.');
  }

  return { pageId: landing.id };
};
