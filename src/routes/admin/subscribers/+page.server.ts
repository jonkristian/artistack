import { db } from '$lib/server/db';
import { subscribers } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  await requireFeature(request, 'subscribersEnabled');

  const rows = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));

  return { subscribers: rows };
};
