import type { Fulfilment, PaymentStatus } from '$lib/server/schema';

/**
 * How an order's two states read.
 *
 * Shared by the list and the order itself so the same order can't be described
 * two ways on two screens. The words avoid the payment industry's vocabulary —
 * nobody selling a t-shirt thinks in authorisations and captures.
 */

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Not paid',
  authorised: 'Reserved',
  captured: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded'
};

export const FULFILMENT_LABELS: Record<Fulfilment, string> = {
  none: 'Not sent',
  packed: 'Packed',
  shipped: 'Posted',
  delivered: 'Delivered'
};

/** Tailwind classes for the payment pill, so the colour follows the meaning. */
export const PAYMENT_TONE: Record<PaymentStatus, string> = {
  // Reserved is amber rather than green on purpose: the money is not yours yet,
  // and this is the state that quietly expires if nobody posts the parcel.
  pending: 'bg-gray-700/50 text-gray-400',
  authorised: 'bg-amber-500/15 text-amber-400',
  captured: 'bg-green-500/15 text-green-400',
  failed: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-gray-700/50 text-gray-500',
  refunded: 'bg-blue-500/15 text-blue-400'
};

/** True when the money is reserved but not yet taken — the thing to act on. */
export function awaitingCapture(status: PaymentStatus): boolean {
  return status === 'authorised';
}
