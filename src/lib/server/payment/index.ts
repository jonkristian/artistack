import { getSetting } from '$lib/server/settings';
import { createVippsProvider } from './vipps';
import { createPayPalProvider } from './paypal';
import { createTestProvider } from './test';
import type { PaymentProvider } from './types';

export type { PaymentProvider, PaymentSession, WebhookEvent } from './types';

/**
 * Which providers are actually usable, decided from the settings.
 *
 * A provider is offered only when every credential it needs is filled in.
 * Half-configured is the common state — you paste the client id, go and find
 * the subscription key, come back tomorrow — and a checkout button that leads
 * to a 500 is worse than one that isn't there yet.
 */

export type ProviderId = 'vipps' | 'paypal' | 'test';

export type ProviderInfo = {
  id: ProviderId;
  /** What the button says. */
  label: string;
};

const LABELS: Record<ProviderId, string> = {
  vipps: 'Vipps',
  paypal: 'PayPal',
  test: 'Test payment'
};

function filled(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The providers that could take a payment right now. */
export async function availableProviders(): Promise<ProviderInfo[]> {
  const payments = await getSetting('payments');
  const ids: ProviderId[] = [];

  if (
    filled(payments.vippsClientId) &&
    filled(payments.vippsClientSecret) &&
    filled(payments.vippsSubscriptionKey) &&
    filled(payments.vippsMerchantSerialNumber)
  ) {
    ids.push('vipps');
  }

  if (filled(payments.paypalClientId) && filled(payments.paypalClientSecret)) {
    ids.push('paypal');
  }

  /*
   * Last, and only when it's been asked for. It has to be switched on
   * deliberately rather than appearing because nothing else is configured — a
   * shop quietly accepting fake payments is a worse failure than one that
   * can't check out at all.
   */
  if (payments.testCheckout) ids.push('test');

  return ids.map((id) => ({ id, label: LABELS[id] }));
}

/**
 * Build a provider, or null if it isn't configured.
 *
 * Constructed per call rather than kept in a module: credentials can be
 * changed in the admin, and a cached client would keep using the old ones
 * until the process restarted.
 */
export async function getProvider(id: string): Promise<PaymentProvider | null> {
  const payments = await getSetting('payments');

  if (id === 'vipps') {
    if (
      !filled(payments.vippsClientId) ||
      !filled(payments.vippsClientSecret) ||
      !filled(payments.vippsSubscriptionKey) ||
      !filled(payments.vippsMerchantSerialNumber)
    ) {
      return null;
    }

    return createVippsProvider({
      clientId: payments.vippsClientId,
      clientSecret: payments.vippsClientSecret,
      subscriptionKey: payments.vippsSubscriptionKey,
      merchantSerialNumber: payments.vippsMerchantSerialNumber,
      testMode: payments.testMode
    });
  }

  if (id === 'paypal') {
    if (!filled(payments.paypalClientId) || !filled(payments.paypalClientSecret)) {
      return null;
    }

    return createPayPalProvider({
      clientId: payments.paypalClientId,
      clientSecret: payments.paypalClientSecret,
      testMode: payments.testMode
    });
  }

  if (id === 'test') {
    return payments.testCheckout ? createTestProvider() : null;
  }

  return null;
}
