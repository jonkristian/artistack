import { requireFeature } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

/**
 * What's been bought.
 *
 * Newest first, because the only question anyone opens this with is what needs
 * posting today.
 */
export const load: PageServerLoad = async ({ request }) => {
  await requireFeature(request, 'shopEnabled');

  return { orders: await db.select().from(orders).orderBy(desc(orders.createdAt)) };
};
