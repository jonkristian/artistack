import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { orders, orderItems } from '$lib/server/schema';
import { getProvider } from '$lib/server/payment';
import { applyPaymentStatus } from '$lib/server/order';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

/**
 * What happens to an order after it's paid for.
 *
 * These write immediately rather than joining the draft. A draft is for
 * something you're composing and might undo; posting a parcel already happened,
 * and money taken can't be un-taken with an Undo button.
 */

export const setFulfilment = command(
  v.object({
    id: v.number(),
    fulfilment: v.picklist(['none', 'packed', 'shipped', 'delivered'])
  }),
  async ({ id, fulfilment }) => {
    await requireUser();

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) error(404, 'That order no longer exists.');

    /*
     * Posting it is what takes the money.
     *
     * The payment was only reserved at checkout, so charging on despatch is the
     * honest moment — and it's the step that's easy to forget, which is why it
     * hangs off the button you were going to press anyway rather than being a
     * second one beside it.
     */
    let captured = false;
    if (fulfilment === 'shipped' && order.paymentStatus === 'authorised') {
      const provider = await getProvider(order.provider);
      if (!provider || !order.providerReference) {
        error(409, 'The payment cannot be captured — check the provider settings.');
      }

      await provider.capture(order.providerReference, order.amount, order.currency);
      captured = true;
    }

    await db
      .update(orders)
      .set({
        fulfilment,
        ...(captured ? { paymentStatus: 'captured' as const } : {}),
        updatedAt: new Date()
      })
      .where(eq(orders.id, id));

    return { success: true, captured };
  }
);

/**
 * Take the money without marking anything as posted.
 *
 * Here for the order that doesn't fit the flow — a pickup at a gig, a parcel
 * someone collected — where the money is due but "shipped" would be a lie.
 */
export const captureOrder = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) error(404, 'That order no longer exists.');
  if (order.paymentStatus !== 'authorised') {
    error(409, 'There is nothing reserved to capture.');
  }

  const provider = await getProvider(order.provider);
  if (!provider || !order.providerReference) {
    error(409, 'The payment cannot be captured — check the provider settings.');
  }

  await provider.capture(order.providerReference, order.amount, order.currency);

  await db
    .update(orders)
    .set({ paymentStatus: 'captured', updatedAt: new Date() })
    .where(eq(orders.id, id));

  return { success: true };
});

/**
 * Ask the provider what it thinks, and record the answer.
 *
 * The manual version of the webhook, for when one was missed — which is the
 * usual reason an order sits at pending long after it was paid for.
 */
export const refreshPaymentStatus = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) error(404, 'That order no longer exists.');
  if (!order.providerReference) error(409, 'This order never reached the payment provider.');

  const provider = await getProvider(order.provider);
  if (!provider) error(409, 'That payment provider is not set up.');

  const status = await provider.status(order.providerReference);
  await applyPaymentStatus(order.reference, status, order.providerReference);

  return { success: true, status };
});

export const deleteOrder = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) error(404, 'That order no longer exists.');

  /*
   * Only an order that never became one. A paid order is a record of money
   * changing hands and of a file someone is still owed, so deleting it would
   * destroy both the receipt and the buyer's access.
   */
  if (order.paymentStatus !== 'pending' && order.paymentStatus !== 'cancelled') {
    error(409, 'A paid order is a receipt — it cannot be deleted.');
  }

  await db.delete(orderItems).where(eq(orderItems.orderId, id));
  await db.delete(orders).where(eq(orders.id, id));

  return { success: true };
});
