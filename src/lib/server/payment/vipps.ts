import type { PaymentProvider, PaymentSession, WebhookEvent } from './types';
import type { PaymentStatus } from '$lib/server/schema';

/**
 * Vipps MobilePay, through the ePayment API.
 *
 * The credential set is four things — client id and secret, a subscription key,
 * and the merchant serial number — and all four go on every request. The access
 * token is fetched separately and cached, because it's good for an hour and
 * fetching one per payment would double the round trips.
 */

type VippsConfig = {
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  merchantSerialNumber: string;
  testMode: boolean;
};

const LIVE_URL = 'https://api.vipps.no';
const TEST_URL = 'https://apitest.vipps.no';

/**
 * How Vipps names its states, mapped onto ours.
 *
 * `AUTHORIZED` is money reserved, `CAPTURED` is money taken. Keeping them apart
 * is the whole reason a parcel can be paid for when it's posted rather than
 * when it's ordered.
 */
const STATUS: Record<string, PaymentStatus> = {
  CREATED: 'pending',
  AUTHORIZED: 'authorised',
  CAPTURED: 'captured',
  CANCELLED: 'cancelled',
  EXPIRED: 'cancelled',
  ABORTED: 'cancelled',
  TERMINATED: 'cancelled',
  REFUNDED: 'refunded'
};

const WEBHOOK_STATUS: Record<string, PaymentStatus> = {
  'epayments.payment.created.v1': 'pending',
  'epayments.payment.authorized.v1': 'authorised',
  'epayments.payment.captured.v1': 'captured',
  'epayments.payment.cancelled.v1': 'cancelled',
  'epayments.payment.expired.v1': 'cancelled',
  'epayments.payment.aborted.v1': 'cancelled',
  'epayments.payment.refunded.v1': 'refunded'
};

export function createVippsProvider(config: VippsConfig): PaymentProvider {
  const baseUrl = config.testMode ? TEST_URL : LIVE_URL;

  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    // Five minutes of slack, so a token can't expire between being checked and
    // being used on a slow request.
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;

    const res = await fetch(`${baseUrl}/accesstoken/get`, {
      method: 'POST',
      headers: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        'Ocp-Apim-Subscription-Key': config.subscriptionKey,
        'Merchant-Serial-Number': config.merchantSerialNumber
      }
    });

    if (!res.ok) {
      throw new Error(`Vipps rejected the credentials: ${await res.text()}`);
    }

    const data = await res.json();
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
    };
    return cached.token;
  }

  function headers(token: string, idempotencyKey?: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'Merchant-Serial-Number': config.merchantSerialNumber,
      'Vipps-System-Name': 'Artistack',
      'Vipps-System-Version': '1.0.0',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    };
  }

  return {
    name: 'vipps',

    async initialize({ order, items, returnUrl, capture }): Promise<PaymentSession> {
      const token = await accessToken();

      /*
       * No `receipt` block.
       *
       * Vipps can show itemised lines, but every line needs its tax split out,
       * and a band selling t-shirts may well be under the VAT threshold.
       * Inventing a 25% split to satisfy the field would put a number on a
       * receipt that isn't true. The description carries what was bought.
       */
      const body = {
        amount: { value: order.amount, currency: order.currency },
        paymentMethod: { type: 'WALLET' },
        reference: order.reference,
        userFlow: 'WEB_REDIRECT',
        returnUrl,
        paymentDescription: items
          .map((i) => `${i.quantity} × ${i.name}`)
          .join(', ')
          .slice(0, 100),
        /*
         * Taken now only when there's nothing to post. A download is delivered
         * the moment it's paid for; a parcel is charged when it goes out.
         */
        directCapture: capture
      };

      const res = await fetch(`${baseUrl}/epayment/v1/payments`, {
        method: 'POST',
        // Keyed on our reference, not on the clock: a retry of the same attempt
        // should be recognised as the same payment rather than making a second.
        headers: headers(token, `artistack-${order.reference}`),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`Vipps refused the payment: ${await res.text()}`);
      }

      const data = await res.json();
      if (!data.reference || !data.redirectUrl) {
        throw new Error('Vipps returned no redirect');
      }

      return {
        reference: data.reference,
        url: data.redirectUrl,
        // Vipps gives a payment about ten minutes before it lapses.
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      };
    },

    async status(providerReference): Promise<PaymentStatus> {
      const token = await accessToken();

      const res = await fetch(`${baseUrl}/epayment/v1/payments/${providerReference}`, {
        headers: headers(token)
      });

      if (!res.ok) {
        throw new Error(`Vipps would not say: ${await res.text()}`);
      }

      const data = await res.json();
      return STATUS[data.state] ?? 'pending';
    },

    async capture(providerReference, amount, currency) {
      const token = await accessToken();

      const res = await fetch(`${baseUrl}/epayment/v1/payments/${providerReference}/capture`, {
        method: 'POST',
        headers: headers(token, `artistack-capture-${providerReference}`),
        body: JSON.stringify({ modificationAmount: { value: amount, currency } })
      });

      if (!res.ok) {
        throw new Error(`Vipps would not take the money: ${await res.text()}`);
      }
    },

    parseWebhook(payload): WebhookEvent | null {
      const event = payload as {
        name?: string;
        reference?: string;
        pspReference?: string;
      };

      const status = event.name ? WEBHOOK_STATUS[event.name] : undefined;
      // An event we don't recognise is ignored rather than guessed at — Vipps
      // adds them, and treating an unknown one as a failure would cancel real
      // orders.
      if (!status || !event.reference) return null;

      return {
        orderReference: event.reference,
        providerReference: event.pspReference ?? event.reference,
        status
      };
    }
  };
}
