import * as v from 'valibot';
import { command, query, getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { findCart, getCartLines } from '$lib/server/cart';
import {
  createOrder,
  shouldCaptureNow,
  needsAddress,
  validateCart,
  CheckoutError,
  getOrderByReference
} from '$lib/server/order';
import { getProvider, availableProviders } from '$lib/server/payment';
import { getGoogleSettings, getSettings } from '$lib/server/settings';
import { error } from '@sveltejs/kit';

/**
 * Starting a payment.
 *
 * Public, like the cart: nobody signs in to buy a record. What it's allowed to
 * charge for comes from the cart cookie, so a request can only ever check out
 * its own basket, and the amount is recomputed here from live prices rather
 * than taken from the form.
 */

export const startCheckout = command(
  v.object({
    provider: v.string(),
    /**
     * The page they were on. The provider sends the browser back to a URL, and
     * by then the panel is gone — so this is how the receipt finds its way to
     * the page it belongs on rather than always the front one.
     */
    from: v.optional(v.string()),
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('We need a name for the order')),
    email: v.pipe(v.string(), v.trim(), v.email('That email address does not look right')),
    phone: v.optional(v.nullable(v.string())),
    addressLine: v.optional(v.nullable(v.string())),
    postcode: v.optional(v.nullable(v.string())),
    city: v.optional(v.nullable(v.string())),
    country: v.optional(v.nullable(v.string())),
    note: v.optional(v.nullable(v.string())),
    marketingOptIn: v.optional(v.boolean())
  }),
  async ({ provider: providerId, from, ...buyer }) => {
    const { cookies, url } = getRequestEvent();

    const cart = await findCart(cookies);
    if (!cart) error(400, 'There is nothing in the basket.');

    const payment = await getProvider(providerId);
    if (!payment) error(400, 'That payment method is not set up.');

    const lines = await getCartLines(cart.id);

    let created;
    try {
      created = await createOrder(cart.id, providerId, buyer);
    } catch (err) {
      if (err instanceof CheckoutError) error(409, err.message);
      throw err;
    }

    /*
     * The reference travels in the payment and comes back on the return URL,
     * which is why it has to be unguessable — it's what proves the person
     * looking at the order page is the person who placed it.
     */
    const session = await payment.initialize({
      order: created.order,
      items: created.items,
      returnUrl: returnUrlFor(url.origin, created.order.reference, from),
      capture: shouldCaptureNow(lines)
    });

    await db
      .update(orders)
      .set({ providerReference: session.reference, updatedAt: new Date() })
      .where(eq(orders.id, created.order.id));

    return { url: session.url, reference: created.order.reference };
  }
);

/**
 * Where the provider sends them back to.
 *
 * Always through `/shop/return`, because that's the only place that can ask the
 * provider what actually happened before anything is shown. It then bounces to
 * the page they started on, which is carried here rather than assumed.
 *
 * `from` is forced to a path on this site. It arrives from the browser, and a
 * return URL that could be pointed at another host is an open redirect with a
 * payment confirmation attached to it.
 */
function returnUrlFor(origin: string, reference: string, from?: string): string {
  const safe = from && /^\/[^/\\]/.test(from) ? from : '/';
  return `${origin}/shop/return?ref=${reference}&to=${encodeURIComponent(safe)}`;
}

/**
 * What the checkout panel needs to draw itself.
 *
 * Asked for when the panel opens rather than loaded with every page: most
 * visitors never open it, and it would otherwise be a settings read on every
 * request for the whole site.
 */
export const checkoutOptions = query(async () => {
  const { cookies } = getRequestEvent();

  const cart = await findCart(cookies);
  const lines = cart ? await getCartLines(cart.id) : [];

  const [google, settings] = await Promise.all([getGoogleSettings(), getSettings()]);

  return {
    providers: await availableProviders(),
    /** Whether the address field can suggest. Without it, it's a plain input. */
    addressLookup: !!google.apiKey && google.placesEnabled,
    /** Whether there's a fan list to offer to join. */
    audience: !!settings?.subscribersEnabled,
    /** Only asked for when something has to be posted. */
    needsAddress: needsAddress(lines),
    /** Sold out or hidden since it went in — said here, not at the bank. */
    problem: validateCart(lines)
  };
});

/**
 * An order, for showing someone what they just bought.
 *
 * Public, and the reference is the whole of the authorisation — it's random and
 * only its buyer has ever seen it. Deliberately narrow: this returns what goes
 * on a receipt and nothing else, so the address and the provider's reference
 * stay on the server where they belong.
 */
export const orderReceipt = query(v.string(), async (reference) => {
  const found = await getOrderByReference(reference);
  if (!found) return null;

  const { order, items } = found;
  const paid = order.paymentStatus === 'authorised' || order.paymentStatus === 'captured';

  return {
    reference: order.reference,
    status: order.paymentStatus,
    paid,
    amount: order.amount,
    currency: order.currency,
    city: order.city,
    items: items.map((item) => ({
      name: item.name,
      variant: item.variant,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      type: item.type,
      // Only once the money is in. Handing the link over first would be handing
      // over the file.
      downloadUrl: paid && item.downloadToken ? `/shop/download/${item.downloadToken}` : null
    }))
  };
});
