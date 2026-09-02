import { requireFeature } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { products } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  await requireFeature(request, 'shopEnabled');

  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Product not found');

  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) error(404, 'Product not found');

  return { product };
};
