import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { PaymentProvider, PaymentSession, WebhookEvent } from './types';
import type { PaymentStatus } from '$lib/server/schema';

/**
 * A payment provider that doesn't take any money.
 *
 * Real ones need a registered company, which is a long way to go before you can
 * find out whether your own checkout works. This one behaves exactly like a
 * real provider from every other file's point of view — it hands back somewhere
 * to send the buyer, and that page decides whether the payment succeeded — so
 * the order, the stock, the receipt and the download are all exercised for
 * real. Only the money is imaginary.
 *
 * It is not a fallback. `availableProviders` offers it only when it has been
 * switched on deliberately, because a shop that silently takes fake payments
 * because a credential was missing is far worse than one that can't check out.
 */

export function createTestProvider(): PaymentProvider {
  return {
    name: 'test',

    async initialize({ order, returnUrl }): Promise<PaymentSession> {
      /*
       * Straight to a page of our own that asks how it should go. No network
       * call: a stub that pretended to reach an API would only be able to fail
       * in ways the real one doesn't.
       */
      return {
        reference: `test-${order.reference}`,
        url: `/shop/test-payment?ref=${order.reference}&return=${encodeURIComponent(returnUrl)}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      };
    },

    /**
     * Whatever was chosen on that page.
     *
     * Read back off the order, because that's where the choice was recorded.
     * Returning a fixed "paid" here would overwrite a deliberate decline the
     * moment the return page checked — and it's the decline path that's worth
     * being able to walk.
     */
    async status(providerReference): Promise<PaymentStatus> {
      const reference = providerReference.replace(/^test-/, '');
      const [order] = await db
        .select({ status: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.reference, reference))
        .limit(1);

      return order?.status ?? 'pending';
    },

    // Nothing to capture. Marking an order posted still moves it to captured,
    // so the admin side behaves as it will with a real provider.
    async capture() {},

    parseWebhook(): WebhookEvent | null {
      return null;
    }
  };
}
