import { db } from './db';
import { orders, orderItems, products } from './schema';
import { getCartLines, type CartLine } from './cart';
import { eq } from 'drizzle-orm';
import { sendReceipt } from './receipt';
import { variantsOf, withVariant } from '$lib/utils/variants';
import { addSubscriber } from './subscribers';
import { getSettings } from './settings';
import type { Order, OrderItem, PaymentStatus } from './schema';

/**
 * Turning a basket into something that owes money.
 *
 * An order is a snapshot: names and prices are copied onto its lines so it
 * still reads correctly after the shop has moved on. Nothing here talks to a
 * payment provider — that's the provider's job, and this stays true whichever
 * one is used.
 */

/**
 * No I, O, 0 or 1 — a reference gets read down a phone and typed back in.
 * Twelve characters of this is around 62 bits, which is far more than anyone
 * is going to guess, and the return page relies on that: the reference is what
 * proves you're the buyer.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `AS-${body}`;
}

/** Unguessable, and the only thing standing between a file and the internet. */
function newDownloadToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export type BuyerDetails = {
  name: string;
  email: string;
  phone?: string | null;
  addressLine?: string | null;
  postcode?: string | null;
  city?: string | null;
  country?: string | null;
  note?: string | null;
  /** Whether they'd like to hear about new releases and merch. */
  marketingOptIn?: boolean;
};

export class CheckoutError extends Error {}

/**
 * Whether the money can be taken straight away.
 *
 * Only when there's nothing to post. A download is delivered the moment it's
 * paid for, so charging then is honest; a parcel is charged when it goes out,
 * which is what the authorise-now-capture-later split is for.
 */
export function shouldCaptureNow(lines: Pick<CartLine, 'type'>[]): boolean {
  return lines.every((line) => line.type === 'digital');
}

export function needsAddress(lines: Pick<CartLine, 'type'>[]): boolean {
  return lines.some((line) => line.type === 'physical');
}

/**
 * Check a basket is actually buyable, and say why not if it isn't.
 *
 * Run at checkout as well as when things go in, because a basket can sit open
 * for days across a price change, a sell-out or a product being hidden.
 */
export function validateCart(lines: CartLine[]): string | null {
  if (lines.length === 0) return 'There is nothing in the basket.';

  const priceless = lines.find((line) => line.price == null);
  if (priceless) return `${priceless.name} has no price — get in touch to buy it.`;

  const currencies = new Set(lines.map((line) => line.currency ?? 'NOK'));
  if (currencies.size > 1) {
    // One payment, one currency. Splitting the basket would be two payments and
    // two orders, which isn't worth building for a shop this size.
    return 'The basket mixes currencies. Buy these separately.';
  }

  const short = lines.find((line) => line.stock != null && line.stock < line.quantity);
  if (short) {
    // Named with its size, because "T-Shirt has sold out" is confusing when the
    // basket also holds a T-shirt that hasn't.
    const label = withVariant(short.name, short.variant);
    return short.stock === 0 ? `${label} has sold out.` : `Only ${short.stock} of ${label} left.`;
  }

  return null;
}

export function linesTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0);
}

/**
 * Write the order and its lines.
 *
 * Stock isn't touched here — it comes off when the money is actually
 * authorised, in `applyPaymentStatus`. Reserving it at this point would mean
 * holding it for every abandoned checkout and needing a sweep to give it back,
 * which is a lot of machinery for a shop selling a few shirts. The window where
 * two people can both check out the last one is real but narrow, and the
 * failure is a refund rather than a lost sale.
 */
export async function createOrder(
  cartId: number,
  provider: string,
  buyer: BuyerDetails
): Promise<{ order: Order; items: OrderItem[] }> {
  const lines = await getCartLines(cartId);

  const problem = validateCart(lines);
  if (problem) throw new CheckoutError(problem);

  if (needsAddress(lines) && !buyer.addressLine) {
    throw new CheckoutError('There is something to post, so an address is needed.');
  }

  const [order] = await db
    .insert(orders)
    .values({
      reference: newReference(),
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone ?? null,
      addressLine: buyer.addressLine ?? null,
      postcode: buyer.postcode ?? null,
      city: buyer.city ?? null,
      country: buyer.country ?? null,
      provider,
      paymentStatus: 'pending',
      fulfilment: 'none',
      amount: linesTotal(lines),
      currency: lines[0].currency ?? 'NOK',
      note: buyer.note ?? null,
      marketingOptIn: buyer.marketingOptIn ?? false
    })
    .returning();

  const items = await db
    .insert(orderItems)
    .values(
      lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        name: line.name,
        unitPrice: line.price ?? 0,
        quantity: line.quantity,
        // Copied like the name and the price: a receipt has to keep saying
        // which size after the product has been edited.
        variant: line.variant || null,
        type: line.type as 'physical' | 'digital',
        // Only a download has one, and it's copied rather than joined so the
        // order stays deliverable after the product is gone.
        fileUrl: line.type === 'digital' ? line.fileUrl : null
      }))
    )
    .returning();

  return { order, items };
}

export async function getOrderByReference(reference: string) {
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

/**
 * How far along a payment is, as a number, so a late message can't undo a
 * later one.
 *
 * The return redirect and the webhook race each other and neither is ordered.
 * Without this, a webhook saying "created" arriving after the buyer has already
 * come back paid would reopen a finished order.
 */
const PROGRESS: Record<PaymentStatus, number> = {
  pending: 0,
  failed: 1,
  cancelled: 1,
  authorised: 2,
  captured: 3,
  refunded: 4
};

/**
 * Take stock off, from the right size.
 *
 * Read-modify-write rather than SQL, because with variants the count lives
 * inside a JSON array and finding the right element in SQLite would be worse to
 * read than doing it here. The list is a handful of sizes.
 *
 * Clamped at zero rather than allowed to go negative: a count that says −1 left
 * is a worse lie than one that says none, and the order is the record of what
 * was oversold.
 */
async function takeStock(productId: number, variant: string | null, quantity: number) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return;

  const list = variantsOf(product);

  if (list.length === 0) {
    // Unlimited stays unlimited.
    if (product.stock == null) return;
    await db
      .update(products)
      .set({ stock: Math.max(0, product.stock - quantity) })
      .where(eq(products.id, productId));
    return;
  }

  /*
   * A size that has since been removed is left alone rather than guessed at.
   * The order still records what was bought; inventing a row here would put a
   * size back into the shop that the artist deliberately took out.
   */
  if (!list.some((v) => v.name === variant)) return;

  const next = list.map((v) =>
    v.name === variant && v.stock != null ? { ...v, stock: Math.max(0, v.stock - quantity) } : v
  );

  await db.update(products).set({ variants: next }).where(eq(products.id, productId));
}

/**
 * Record what the provider says, and do what follows from it.
 *
 * Idempotent, because it's called from both the return page and the webhook,
 * usually about the same payment within a second of each other. Stock comes off
 * and download links are issued exactly once — on the first move into
 * authorised or captured.
 */
export async function applyPaymentStatus(
  reference: string,
  status: PaymentStatus,
  providerReference?: string | null,
  /** Where download links should point. Omitted, the receipt isn't sent. */
  origin?: string
): Promise<Order | null> {
  const found = await getOrderByReference(reference);
  if (!found) return null;

  const { order, items } = found;

  const wasPaid = PROGRESS[order.paymentStatus] >= PROGRESS.authorised;
  const nowPaid = PROGRESS[status] >= PROGRESS.authorised;

  // Never move backwards. A stale message about an earlier stage still gets us
  // the provider's reference, which is worth keeping.
  const next = PROGRESS[status] > PROGRESS[order.paymentStatus] ? status : order.paymentStatus;

  if (!wasPaid && nowPaid) {
    for (const item of items) {
      if (item.productId != null && item.type === 'physical') {
        await takeStock(item.productId, item.variant, item.quantity);
      }

      if (item.type === 'digital' && !item.downloadToken) {
        await db
          .update(orderItems)
          .set({ downloadToken: newDownloadToken() })
          .where(eq(orderItems.id, item.id));
      }
    }
  }

  const [updated] = await db
    .update(orders)
    .set({
      paymentStatus: next,
      providerReference: providerReference ?? order.providerReference,
      updatedAt: new Date()
    })
    .where(eq(orders.id, order.id))
    .returning();

  /*
   * Now they're a customer, which is the whole basis for mailing them.
   *
   * markedsføringsloven § 15 lets a seller write to a buyer about similar goods
   * without prior consent, provided they were given a plain chance to decline
   * when the address was taken — the checkbox at checkout — and in every
   * message, which the one-click unsubscribe covers. On the paid transition, so
   * it happens once and only for a sale that happened.
   */
  let unsubscribeToken: string | null = null;
  if (!wasPaid && nowPaid && updated.marketingOptIn) {
    try {
      const settings = await getSettings();
      if (settings?.subscribersEnabled) {
        unsubscribeToken = await addSubscriber({
          email: updated.buyerEmail,
          name: updated.buyerName,
          source: 'checkout',
          country: updated.country,
          // Buying something is not a request to be mailed. Someone who has
          // opted out before stays out, whatever a tickbox said.
          revivesUnsubscribed: false
        });
      }
    } catch (err) {
      // A list that didn't grow is not a reason to fail a paid order.
      console.error('[checkout] could not add to the fan list', err);
    }
  }

  /*
   * Sent on the same one-way transition that issues the tokens, so a webhook
   * and a return redirect arriving together can't send two receipts. Read back
   * rather than reused, because the tokens were written a moment ago.
   */
  if (!wasPaid && nowPaid && origin) {
    const fresh = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await sendReceipt(updated, fresh, origin, unsubscribeToken);
  }

  return updated;
}
