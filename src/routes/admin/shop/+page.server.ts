import { requireFeature } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { products } from '$lib/server/schema';
import { asc } from 'drizzle-orm';
import { getOrCreateShopPage } from '$lib/server/shop';
import type { PageServerLoad } from './$types';

/**
 * Products are queried here rather than in the layout: unlike releases or
 * shows they aren't part of the draft — a price is saved when you save it, not
 * when you publish the page — so there's no layout copy to shadow.
 */
export const load: PageServerLoad = async ({ request }) => {
  await requireFeature(request, 'shopEnabled');

  /*
   * `getOrCreateShopPage` is called for its effect, not its answer: the shop
   * needs a row in `pages` so it has an address, and this is the screen you
   * reach first.
   *
   * Products aren't loaded here either. The layout already has them with their
   * tags attached, and a second query would shadow that copy with one missing
   * them.
   */
  await getOrCreateShopPage();

  return {};
};
