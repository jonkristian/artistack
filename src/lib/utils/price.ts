/**
 * Money, formatted once.
 *
 * Prices are stored in minor units — øre, cents — because decimals are a
 * rounding error waiting to be charged to someone. Everything that shows a
 * price divides by 100 in exactly this one place.
 */
export function formatPrice(
  minorUnits: number | null | undefined,
  currency: string | null | undefined,
  locale: string | null | undefined
): string {
  // Null is "ask", which is a real answer for a one-off or a commission —
  // distinct from a price of zero, which means free.
  if (minorUnits == null) return 'Ask';

  return new Intl.NumberFormat(locale || 'nb-NO', {
    style: 'currency',
    currency: currency || 'NOK',
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2
  }).format(minorUnits / 100);
}
