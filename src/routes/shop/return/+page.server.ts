import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { carts, cartItems } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { findCart } from '$lib/server/cart';
import { getOrderByReference, applyPaymentStatus } from '$lib/server/order';
import { getProvider } from '$lib/server/payment';
import type { PageServerLoad } from './$types';

/**
 * Where the browser lands on the way back from paying.
 *
 * Not a page — nothing here renders. The basket and the receipt live in a panel
 * that opens over whatever you were already looking at, and by the time a
 * provider redirects you back, that panel is gone along with the rest of the
 * page. So this exists to be a URL a provider can be given: it settles the
 * payment, empties the basket, and puts you back where you started with the
 * order named in the address, which is what reopens the panel.
 *
 * The redirect itself proves nothing — it happens whether the payment worked,
 * was abandoned or was declined, and it can be typed in by hand. The status is
 * asked of the provider instead.
 */
export const load: PageServerLoad = async ({ url, cookies }) => {
  const reference = url.searchParams.get('ref');
  if (!reference) error(404, 'No order');

  const found = await getOrderByReference(reference);
  if (!found) error(404, 'No order');

  let { order } = found;

  if (order.providerReference) {
    const provider = await getProvider(order.provider);
    if (provider) {
      try {
        const status = await provider.status(order.providerReference);
        order =
          (await applyPaymentStatus(reference, status, order.providerReference, url.origin)) ??
          order;
      } catch (err) {
        /*
         * The provider being unreachable isn't the buyer's problem and isn't
         * worth an error page — the webhook will settle it. They get the order
         * as it stands, which is honest.
         */
        console.error('[checkout] could not read payment status', err);
      }
    }
  }

  const paid = order.paymentStatus === 'authorised' || order.paymentStatus === 'captured';

  /*
   * The basket is emptied here rather than when the order was created, so an
   * abandoned payment leaves it intact — coming back to a shop that's forgotten
   * what you'd chosen is its own small insult.
   */
  if (paid) {
    const cart = await findCart(cookies);
    if (cart) {
      await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
      await db.delete(carts).where(eq(carts.id, cart.id));
      cookies.delete('cart', { path: '/' });
    }
  }

  /*
   * Back where they started. Re-checked here as well as when it was stored:
   * this is a redirect built from something the browser said, and one that
   * could be pointed at another host is an open redirect with a payment
   * confirmation attached.
   */
  const to = url.searchParams.get('to');
  const destination = to && /^\/[^/\\]/.test(to) ? to : '/';
  const separator = destination.includes('?') ? '&' : '?';

  redirect(303, `${destination}${separator}order=${encodeURIComponent(reference)}`);
};
