import { requireFeature } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { orders, orderItems, products } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, params }) => {
  await requireFeature(request, 'shopEnabled');

  const id = Number(params.id);
  if (!Number.isInteger(id)) error(404, 'Order not found');

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) error(404, 'Order not found');

  /*
   * The picture comes from the live product, not from the order line.
   *
   * Everything the order has to keep saying — the name, the price, the option —
   * is copied onto the line, because a receipt has to stay true. A photograph
   * isn't that: it's there so whoever is packing can see what they're looking
   * for, and if the product has since been deleted its absence costs nothing.
   */
  const items = await db
    .select({
      id: orderItems.id,
      name: orderItems.name,
      variant: orderItems.variant,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      type: orderItems.type,
      downloadToken: orderItems.downloadToken,
      imageUrl: products.imageUrl
    })
    .from(orderItems)
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, order.id));

  return { order, items };
};
