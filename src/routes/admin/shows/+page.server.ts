import { requireFeature } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

/**
 * No query here: the admin layout already loads every show into the draft, and
 * the list reads it from there. Fetching them again would shadow the layout's
 * copy in merged page data and show saved values next to unsaved ones.
 */
export const load: PageServerLoad = async ({ request }) => {
  await requireFeature(request, 'showsEnabled');
  return {};
};
