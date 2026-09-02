import { db } from './db';
import { carts, cartItems, products } from './schema';
import { and, eq, lt, inArray } from 'drizzle-orm';
import { stockOf } from '$lib/utils/variants';
import type { Cookies } from '@sveltejs/kit';

/**
 * The basket, found by a cookie.
 *
 * No sign-in: nobody makes an account to buy a t-shirt. The cookie holds an
 * unguessable token and the cart itself lives server-side, so a tampered cookie
 * finds nothing rather than someone else's basket.
 */

const COOKIE = 'cart';

/** Long enough to come back tomorrow, short enough not to be a tracking cookie. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * How long an untouched cart survives.
 *
 * Most carts are abandoned, so they're swept rather than kept forever. Measured
 * from the last change, not from creation — a cart someone is still adding to
 * shouldn't disappear mid-shop.
 */
const STALE_DAYS = 30;

function newToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * Deletes carts nothing has touched in a month, and their items.
 *
 * Runs when a cart is created rather than on a schedule: there's no scheduler
 * here, and the moment someone starts a new basket is both rare enough to be
 * cheap and frequent enough to keep the table from growing without bound.
 */
async function sweepStaleCarts() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const stale = await db.select({ id: carts.id }).from(carts).where(lt(carts.updatedAt, cutoff));
  if (stale.length === 0) return;

  const ids = stale.map((c) => c.id);
  await db.delete(cartItems).where(inArray(cartItems.cartId, ids));
  await db.delete(carts).where(inArray(carts.id, ids));
}

/** The cart this browser already has, or null. Never creates one. */
export async function findCart(cookies: Cookies) {
  const token = cookies.get(COOKIE);
  if (!token) return null;

  const [cart] = await db.select().from(carts).where(eq(carts.token, token)).limit(1);
  return cart ?? null;
}

/**
 * The cart this browser has, making one if it hasn't.
 *
 * Only call this when something is actually going into a basket — creating one
 * to render an empty shop would write a row and set a cookie for every visitor
 * who never buys anything.
 */
export async function getOrCreateCart(cookies: Cookies) {
  const existing = await findCart(cookies);
  if (existing) return existing;

  await sweepStaleCarts();

  const token = newToken();
  const [cart] = await db.insert(carts).values({ token }).returning();

  cookies.set(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE
  });

  return cart;
}

/** Marks a cart as touched, so the sweep leaves it alone. */
export async function touchCart(cartId: number) {
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export type CartLine = {
  productId: number;
  /** Which size, or empty for a product that has none. Part of the line's key. */
  variant: string;
  name: string;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  /** Copied onto the order line at checkout, so a download survives a delete. */
  fileUrl: string | null;
  type: string;
  quantity: number;
  /**
   * What's left of this size, or null for unlimited. Read now rather than when
   * it went in, so a basket left open across a sell-out tells the truth.
   */
  stock: number | null;
};

/**
 * The cart's contents, priced as they are right now.
 *
 * Joined against the live product rather than stored on the line: a basket left
 * open across a price change should show the new price, and a product that's
 * been hidden or deleted should drop out rather than be sold.
 */
export async function getCartLines(cartId: number): Promise<CartLine[]> {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      price: products.price,
      currency: products.currency,
      imageUrl: products.imageUrl,
      fileUrl: products.fileUrl,
      type: products.type,
      stock: products.stock,
      variants: products.variants,
      variant: cartItems.variant,
      quantity: cartItems.quantity
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(and(eq(cartItems.cartId, cartId), eq(products.visible, true)));

  /*
   * Stock is resolved per line, not per product: a basket holding an M and an L
   * is two lines against two counts, and reporting the product's own number
   * against either would be reporting a number that means nothing.
   */
  return rows.map(({ variants, ...row }) => ({
    ...row,
    stock: stockOf({ stock: row.stock, variants }, row.variant || null)
  }));
}

/** Minor units, so it can be handed to a payment provider unchanged. */
export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0);
}
