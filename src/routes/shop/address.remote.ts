import * as v from 'valibot';
import { query, getRequestEvent } from '$app/server';
import { getGoogleSettings } from '$lib/server/settings';
import { findCart } from '$lib/server/cart';
import { error } from '@sveltejs/kit';

/**
 * Address lookup for the checkout form.
 *
 * Server-side, so the Google key stays where it belongs — it lives in a
 * `secret` settings subject and never reaches a page. The admin's venue
 * autocomplete loads Google's browser SDK with the key in the script URL, which
 * is fine behind a login and would not be fine here.
 *
 * Google's Places API is billed per request, so both of these refuse anyone
 * without a basket. Not much of a lock, but it means the cost is tied to
 * someone actually shopping rather than to anyone who finds the endpoint, and
 * it costs a cookie check to enforce.
 */

/** Fails closed: no key, no lookup, and the form stays a plain text field. */
async function requireLookup() {
  const { cookies } = getRequestEvent();

  const cart = await findCart(cookies);
  if (!cart) error(403, 'No basket');

  const google = await getGoogleSettings();
  if (!google.apiKey || !google.placesEnabled) error(404, 'Address lookup is off');

  return google.apiKey;
}

export const addressSuggestions = query(
  v.pipe(v.string(), v.trim(), v.minLength(3)),
  async (input) => {
    const apiKey = await requireLookup();

    /*
     * The classic endpoint rather than Places API (New), which isn't enabled on
     * this project. It's also what the admin's venue lookup already uses, so
     * both features need the same one API switched on rather than two.
     */
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    // Street addresses, not restaurants — this field is where a parcel goes.
    url.searchParams.set('types', 'address');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (data.status !== 'OK') return [];

    return (data.predictions ?? [])
      .slice(0, 5)
      .map((p: { place_id: string; description: string }) => ({
        id: p.place_id,
        description: p.description
      }));
  }
);

export const addressDetails = query(v.string(), async (placeId) => {
  const apiKey = await requireLookup();

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'address_component,formatted_address');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url);
  if (!res.ok) error(502, 'Could not look that up');

  const data = await res.json();
  if (data.status !== 'OK') error(404, 'Could not look that up');

  const components: { types: string[]; long_name: string }[] =
    data.result?.address_components ?? [];
  const find = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? null;

  /*
   * The street line is taken from Google's formatted address rather than
   * assembled from the parts, because the order differs by country — "Karl
   * Johans gate 1" here, "1 Karl Johans Street" elsewhere — and Google already
   * knows which. Everything before the first comma is the street.
   */
  const formatted: string = data.result?.formatted_address ?? '';
  const addressLine = formatted.split(',')[0]?.trim() || null;

  return {
    addressLine,
    postcode: find('postal_code'),
    // `postal_town` is what Google uses for a postal city; `locality` is the
    // administrative one, and they differ often enough to check both.
    city: find('postal_town') ?? find('locality') ?? find('administrative_area_level_2'),
    country: find('country')
  };
});
