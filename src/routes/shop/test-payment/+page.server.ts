import { error, redirect } from '@sveltejs/kit';
import { getOrderByReference, applyPaymentStatus } from '$lib/server/order';
import { getSetting } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where the test provider sends the buyer instead of a bank.
 *
 * It stands in for the page Vipps would show, and it asks the one question
 * that page really answers: did this go through? Everything downstream — the
 * order, the stock, the receipt, the download — then happens for real.
 */

/** Refuses to exist unless the test checkout is switched on. */
async function requireTestCheckout() {
  const payments = await getSetting('payments');
  if (!payments.testCheckout) error(404, 'Not found');
}

export const load: PageServerLoad = async ({ url }) => {
  await requireTestCheckout();

  const reference = url.searchParams.get('ref');
  if (!reference) error(404, 'Not found');

  const found = await getOrderByReference(reference);
  if (!found) error(404, 'Not found');

  return {
    order: found.order,
    items: found.items,
    // Carried through rather than rebuilt, so this page doesn't have to know
    // where the shop sends people back to.
    returnUrl: url.searchParams.get('return') ?? `/shop/return?ref=${reference}`
  };
};

export const actions: Actions = {
  default: async ({ request, url }) => {
    await requireTestCheckout();

    const form = await request.formData();
    const reference = String(form.get('reference') ?? '');
    const outcome = String(form.get('outcome') ?? '');
    const returnUrl = String(form.get('returnUrl') ?? '');

    const found = await getOrderByReference(reference);
    if (!found) error(404, 'Not found');

    /*
     * `authorised` rather than `captured`, matching what a real provider does
     * for something that has to be posted — so the order lands in the admin
     * needing the same action a real one would.
     */
    const status = outcome === 'paid' ? 'authorised' : 'cancelled';

    await applyPaymentStatus(reference, status, `test-${reference}`, url.origin);

    // Back the way a real provider would send them, so the return page runs
    // exactly as it will in production.
    redirect(303, returnUrl || `/shop/return?ref=${reference}`);
  }
};
