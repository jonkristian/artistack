import { json } from '@sveltejs/kit';
import { getProvider } from '$lib/server/payment';
import { getOrderByReference, applyPaymentStatus } from '$lib/server/order';
import type { RequestHandler } from './$types';

/**
 * Where the provider tells us what happened.
 *
 * The body is treated as a nudge, not as evidence. Anyone can POST here, so the
 * status in the payload is thrown away and the provider is asked directly about
 * the order the payload names. The worst a forged request can do is make us
 * re-read a payment we already own.
 *
 * That's also why there's no signature check: verifying one would mean storing
 * a webhook secret and registering the endpoint, and it would still only prove
 * the message came from the provider — which asking the provider proves anyway.
 */
export const POST: RequestHandler = async ({ params, request, url }) => {
  const provider = await getProvider(params.provider);
  // Always 200. A provider that gets an error retries, and retrying a webhook
  // for a provider that isn't configured would go on for days.
  if (!provider) return json({ ok: true });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: true });
  }

  const event = provider.parseWebhook(payload);
  if (!event) return json({ ok: true });

  const found = await getOrderByReference(event.orderReference);
  if (!found) return json({ ok: true });

  const providerReference = found.order.providerReference ?? event.providerReference;

  try {
    const status = await provider.status(providerReference);
    await applyPaymentStatus(event.orderReference, status, providerReference, url.origin);
  } catch (err) {
    console.error('[webhook] could not read payment status', err);
    // 502, so the provider tries again — this is the case where a retry helps.
    return json({ ok: false }, { status: 502 });
  }

  return json({ ok: true });
};
