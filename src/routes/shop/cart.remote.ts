import * as v from 'valibot';
import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { cartItems, products } from '$lib/server/schema';
import { getOrCreateCart, touchCart, getCartLines, cartTotal } from '$lib/server/cart';
import { and, eq, sql } from 'drizzle-orm';
import { hasVariants, stockOf, variantsOf } from '$lib/utils/variants';
import { error } from '@sveltejs/kit';

/**
 * Putting things in a basket.
 *
 * Public — no `requireUser`, because the person buying isn't signed in. What
 * protects a cart is that its token is unguessable and lives in an httpOnly
 * cookie, so a browser can only ever reach its own.
 */

/** What every call returns, so the page can re-render from one round trip. */
async function cartState(cartId: number) {
  const lines = await getCartLines(cartId);
  return { lines, total: cartTotal(lines) };
}

/**
 * How many of a thing. A whole number, at least one, and not more than anyone
 * buys at a merch table.
 *
 * The bound matters more than it looks. A line's contribution to the total is
 * `price * quantity`, so a *negative* quantity was money coming off the bill —
 * put a record in the basket, add a download at minus five, and the provider
 * was asked to charge the difference while the order still said to post the
 * record. Nothing downstream would have caught it: the stock check reads
 * `stock < quantity`, which a negative passes.
 */
const MAX_PER_LINE = 99;
const quantitySchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_PER_LINE));

export const addToCart = command(
  v.object({
    productId: v.number(),
    /** Which size. Empty, or absent, for a product that has none. */
    variant: v.optional(v.string()),
    quantity: v.optional(quantitySchema)
  }),
  async ({ productId, variant = '', quantity = 1 }) => {
    const { cookies } = getRequestEvent();

    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.visible, true)))
      .limit(1);

    if (!product) error(404, 'That product is no longer available.');

    /*
     * A product with sizes can only be bought as one of them, and only one that
     * exists. Trusting the name off the request would let a crafted call add a
     * size nobody stocks, which would then be a line nobody could fulfil.
     */
    if (hasVariants(product)) {
      if (!variant) error(400, 'Choose a size first.');
      if (!variantsOf(product).some((v) => v.name === variant)) {
        error(404, 'That option is no longer available.');
      }
    } else if (variant) {
      error(400, 'That product has no options.');
    }

    /*
     * Checked here as well as at checkout. This is the friendly refusal — it
     * stops someone filling a basket with something that isn't there. The one
     * that actually protects the stock is at payment, because between here and
     * there somebody else can buy the last one.
     */
    const available = stockOf(product, variant || null);
    if (available != null && available <= 0) {
      error(409, 'That one has sold out.');
    }

    const cart = await getOrCreateCart(cookies);

    await db
      .insert(cartItems)
      .values({ cartId: cart.id, productId, variant, quantity })
      .onConflictDoUpdate({
        // The variant is part of the key: an M and an L are two lines, but a
        // second M raises the first rather than making a third.
        target: [cartItems.cartId, cartItems.productId, cartItems.variant],
        // Clamped, or repeated adds would walk a line past the cap one at a time.
        set: { quantity: sql`min(${cartItems.quantity} + ${quantity}, ${MAX_PER_LINE})` }
      });

    await touchCart(cart.id);
    return cartState(cart.id);
  }
);

export const setCartQuantity = command(
  v.object({
    productId: v.number(),
    variant: v.optional(v.string()),
    // Zero as well, which is how the UI removes a line.
    quantity: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_PER_LINE))
  }),
  async ({ productId, variant = '', quantity }) => {
    const { cookies } = getRequestEvent();
    const cart = await getOrCreateCart(cookies);

    // Zero is how the UI removes a line, rather than a second command that
    // means the same thing.
    if (quantity <= 0) {
      await db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.cartId, cart.id),
            eq(cartItems.productId, productId),
            eq(cartItems.variant, variant)
          )
        );
    } else {
      await db
        .update(cartItems)
        .set({ quantity })
        .where(
          and(
            eq(cartItems.cartId, cart.id),
            eq(cartItems.productId, productId),
            eq(cartItems.variant, variant)
          )
        );
    }

    await touchCart(cart.id);
    return cartState(cart.id);
  }
);
