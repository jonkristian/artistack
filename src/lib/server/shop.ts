import { db } from './db';
import { pages, products, orderItems } from './schema';
import { eq, and } from 'drizzle-orm';

/**
 * The page the shop lives at.
 *
 * Created on demand rather than by a switch: unlike a gig, there's exactly one
 * shop and it's the whole point of the section being on. Its address is
 * `/shop`, which nothing else can claim — `pages` owns every slug.
 */
export async function getOrCreateShopPage() {
  const [existing] = await db.select().from(pages).where(eq(pages.type, 'shop')).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(pages)
    .values({ slug: 'shop', title: 'Shop', type: 'shop', published: true })
    .returning();

  return created;
}

/**
 * Whether a file has been paid for, and so must not be served from /uploads.
 *
 * A digital product's file sits in the same directory as every sleeve and press
 * photo, which would make its public URL the real way to get it and the
 * download token decorative. Rather than move the file — which would break its
 * media row, its thumbnail and the picker that chose it — the public route
 * refuses it, leaving the token route as the only way out.
 *
 * Order lines are checked as well as products: a product can be deleted while
 * the orders that bought it are still owed the file.
 *
 * A query per request, deliberately. Both tables are small, better-sqlite3 is
 * synchronous and local, and a cache here would mean a window in which a file
 * just marked as paid is still being handed out.
 */
export async function isPaidFile(url: string): Promise<boolean> {
  const [live] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.fileUrl, url), eq(products.type, 'digital')))
    .limit(1);
  if (live) return true;

  const [sold] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.fileUrl, url))
    .limit(1);

  return !!sold;
}
