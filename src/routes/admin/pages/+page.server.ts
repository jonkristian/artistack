import { requireFeature } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

/**
 * No query here: the admin layout already loads every page, and the list reads
 * it from there. Fetching them again would shadow the layout's copy in merged
 * page data.
 */
export const load: PageServerLoad = async ({ request }) => {
  await requireFeature(request, 'pagesEnabled');
  return {};
};
