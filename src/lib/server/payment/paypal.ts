import type { PaymentProvider, PaymentSession, WebhookEvent } from './types';
import type { PaymentStatus } from '$lib/server/schema';

/**
 * PayPal, through the Orders v2 API.
 *
 * Worth having even without a company behind it: PayPal's sandbox needs no more
 * than a PayPal login, so the whole flow can be walked against a real provider
 * rather than a stand-in. Switching to live is the same code with different
 * credentials.
 *
 * It differs from Vipps in one structural way. Vipps reserves the money when
 * the buyer approves; PayPal only marks the order approved and waits for us to
 * ask for the money in a second call. That second call happens in `status`,
 * which is where the buyer's return and the webhook both land — so from the
 * shop's side both providers behave the same, and the difference stops here.
 */

type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  testMode: boolean;
};

const LIVE_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

/** PayPal talks in major units with two decimals, unlike everything else here. */
function toMajor(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

export function createPayPalProvider(config: PayPalConfig): PaymentProvider {
  const baseUrl = config.testMode ? SANDBOX_URL : LIVE_URL;

  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    // Five minutes of slack, so a token can't expire between being checked and
    // being used on a slow request.
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;

    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      throw new Error(`PayPal rejected the credentials: ${await res.text()}`);
    }

    const data = await res.json();
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
    };
    return cached.token;
  }

  async function call(path: string, token: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    });

    if (!res.ok) {
      throw new Error(`PayPal said no to ${path}: ${await res.text()}`);
    }

    // Capture and authorize can answer 204 with nothing in the body.
    const body = await res.text();
    return body ? JSON.parse(body) : {};
  }

  /**
   * Whether the money has actually been asked for yet.
   *
   * An approved order is one the buyer has agreed to and nothing more — no
   * money is reserved until we call authorize, and none is taken until we call
   * capture. Reporting `approved` as paid would mean shipping against a payment
   * that was never collected.
   */
  function readState(order: {
    status?: string;
    purchase_units?: { payments?: { captures?: unknown[]; authorizations?: unknown[] } }[];
  }): PaymentStatus {
    const payments = order.purchase_units?.[0]?.payments;

    if (payments?.captures?.length) return 'captured';
    if (payments?.authorizations?.length) return 'authorised';

    switch (order.status) {
      case 'COMPLETED':
        // Completed with neither recorded is not a state PayPal should produce,
        // but treating it as paid on the strength of a status alone is exactly
        // the assumption worth not making.
        return 'authorised';
      case 'VOIDED':
        return 'cancelled';
      default:
        // CREATED, SAVED, APPROVED, PAYER_ACTION_REQUIRED — all still owing.
        return 'pending';
    }
  }

  return {
    name: 'paypal',

    async initialize({ order, items, returnUrl, capture }): Promise<PaymentSession> {
      const token = await accessToken();

      const body = {
        /*
         * Taken now only when there's nothing to post. A download is delivered
         * the moment it's paid for; a parcel is charged when it goes out, which
         * is what the authorise-then-capture split is for.
         */
        intent: capture ? 'CAPTURE' : 'AUTHORIZE',
        purchase_units: [
          {
            // Ours, on both fields PayPal will echo back. `custom_id` survives
            // into the webhook, which `reference_id` does not always do.
            reference_id: order.reference,
            custom_id: order.reference,
            description: items
              .map((i) => `${i.quantity} × ${i.name}`)
              .join(', ')
              .slice(0, 127),
            amount: {
              currency_code: order.currency,
              value: toMajor(order.amount)
            }
          }
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: returnUrl,
              // Cancelling lands in the same place. The return route asks
              // PayPal what happened rather than believing the URL, so an
              // abandoned payment resolves correctly without a second route.
              cancel_url: returnUrl,
              // Says "Pay Now" rather than "Continue", so the buyer isn't left
              // wondering whether there's another step after this one.
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING'
            }
          }
        }
      };

      const created = await call('/v2/checkout/orders', token, {
        method: 'POST',
        headers: {
          // Keyed on our reference, not the clock: a retried attempt should be
          // recognised as the same order rather than making a second one.
          'PayPal-Request-Id': `artistack-${order.reference}`
        },
        body: JSON.stringify(body)
      });

      /*
       * `payer-action` is what Orders v2 returns when the payment source is
       * given up front, `approve` is the older name. Both mean "send them
       * here", and accepting either keeps this working across the change.
       */
      const link = (created.links ?? []).find(
        (l: { rel?: string }) => l.rel === 'payer-action' || l.rel === 'approve'
      );

      if (!created.id || !link?.href) {
        throw new Error('PayPal returned no approval link');
      }

      return {
        reference: created.id,
        url: link.href,
        // PayPal keeps an unapproved order for about three hours.
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000)
      };
    },

    /**
     * What happened, and finishing it if the buyer's half is done.
     *
     * This is the call that turns an approval into money, which is why it does
     * more than read. Both the return page and the webhook come through here,
     * and it's safe for both: an order already authorised or captured is
     * reported, not acted on again.
     */
    async status(providerReference): Promise<PaymentStatus> {
      const token = await accessToken();
      const order = await call(`/v2/checkout/orders/${providerReference}`, token);

      const current = readState(order);
      if (current !== 'pending' || order.status !== 'APPROVED') return current;

      // Approved and nothing collected yet: ask for the money the way the
      // order was opened for.
      const path =
        order.intent === 'CAPTURE'
          ? `/v2/checkout/orders/${providerReference}/capture`
          : `/v2/checkout/orders/${providerReference}/authorize`;

      const settled = await call(path, token, {
        method: 'POST',
        // Same key as the read that found it approved would be wrong; this is a
        // different operation on the same order.
        headers: { 'PayPal-Request-Id': `artistack-settle-${providerReference}` },
        body: '{}'
      });

      return readState(settled);
    },

    /**
     * Take money that was only reserved.
     *
     * The authorisation's id is looked up rather than remembered: PayPal issues
     * it during `status`, long after the order row was written, and an order can
     * be read for it at any time. One extra call to avoid a column that would
     * only ever hold a value one provider needs.
     */
    async capture(providerReference, amount, currency) {
      const token = await accessToken();
      const order = await call(`/v2/checkout/orders/${providerReference}`, token);

      const authorisation = order.purchase_units?.[0]?.payments?.authorizations?.[0];
      if (!authorisation?.id) {
        throw new Error('PayPal has nothing reserved on that order to capture');
      }

      await call(`/v2/payments/authorizations/${authorisation.id}/capture`, token, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `artistack-capture-${providerReference}` },
        body: JSON.stringify({
          amount: { currency_code: currency, value: toMajor(amount) },
          final_capture: true
        })
      });
    },

    parseWebhook(payload): WebhookEvent | null {
      const event = payload as {
        event_type?: string;
        resource?: {
          id?: string;
          custom_id?: string;
          supplementary_data?: { related_ids?: { order_id?: string } };
          purchase_units?: { custom_id?: string; reference_id?: string }[];
        };
      };

      const resource = event.resource;
      if (!resource) return null;

      /*
       * Our reference travels in `custom_id`, which sits in a different place
       * depending on whether the event is about the order or about a payment
       * against it.
       */
      const orderReference =
        resource.custom_id ??
        resource.purchase_units?.[0]?.custom_id ??
        resource.purchase_units?.[0]?.reference_id;

      /*
       * The order's id, which is what we stored. A payment event carries it
       * under supplementary data; an order event is the order.
       */
      const providerReference = resource.supplementary_data?.related_ids?.order_id ?? resource.id;

      if (!orderReference || !providerReference) return null;

      /*
       * The status is deliberately not read out of the event. The webhook is
       * treated as a nudge to go and ask, so a forged one can't do more than
       * make us re-read a payment we already own.
       */
      return { orderReference, providerReference, status: 'pending' };
    }
  };
}
