import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import type { CartLine } from '$lib/server/cart';
import { addToCart, setCartQuantity } from '../../routes/shop/cart.remote';

/**
 * The basket, once, for the whole page.
 *
 * The shop page and the shop block can both be on screen at the same time, and
 * two copies of this state would disagree the moment either was used — one
 * showing an item added, the other still offering to add it. Every command
 * returns the whole basket, so one round trip both makes the change and settles
 * what the basket now is.
 *
 * Browser only, and that is not a detail. This module is evaluated once per
 * server process, so anything held here during server rendering is held for
 * every visitor at once — one person's basket would render into another
 * person's page. `seed` refuses to run on the server for that reason, and the
 * button and panel that read it draw nothing until the page is live. The cost
 * is that a basket already full appears a moment after load rather than in the
 * first paint, which is the right trade for state that belongs to one person.
 */

let lines = $state<CartLine[]>([]);
let total = $state(0);
let busy = $state<number | null>(null);

/**
 * The panel, and which of its three faces is showing.
 *
 * Held here rather than in the component because the thing that opens it — a
 * button floating over the page — and the thing that fills it are siblings,
 * and because adding to the basket from a product tile has to be able to say
 * "and show them". Three views rather than three pages: the basket, the form,
 * and what happened.
 */
export type CartView = 'basket' | 'checkout' | 'receipt';

let open = $state(false);
let view = $state<CartView>('basket');

/**
 * The last server payload, by identity.
 *
 * Reseeding on every change would fight the answer the command just gave us, so
 * a load only takes effect when the server actually sends a different object —
 * a reload, or navigating back to the shop.
 */
let seeded: unknown = null;

export function seed(cart: { lines: CartLine[]; total: number }) {
  // Never on the server. See the note at the top — this state is shared by
  // every request that process handles.
  if (!browser) return;
  if (seeded === cart) return;
  seeded = cart;
  lines = cart.lines;
  total = cart.total;
}

export function getLines(): CartLine[] {
  return lines;
}

export function getTotal(): number {
  return total;
}

/** Which product is mid-request, so only its own control is disabled. */
export function busyWith(): number | null {
  return busy;
}

/**
 * How many of one thing are in the basket.
 *
 * Keyed by size as well as product, because an M and an L are two lines. Called
 * without one it answers for the whole product, which is what a tile needs to
 * decide between "Add" and a quantity.
 */
export function quantityOf(productId: number, variant?: string | null): number {
  if (variant === undefined) {
    return lines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }
  return (
    lines.find((line) => line.productId === productId && line.variant === (variant ?? ''))
      ?.quantity ?? 0
  );
}

export function isEmpty(): boolean {
  return lines.length === 0;
}

/** The currency the basket is in. One payment, one currency. */
export function currency(): string | null {
  return lines[0]?.currency ?? null;
}

async function run(productId: number, work: () => Promise<{ lines: CartLine[]; total: number }>) {
  if (busy != null) return;
  busy = productId;
  try {
    const next = await work();
    lines = next.lines;
    total = next.total;
    // The server's answer replaces the seed, so a later load of the same stale
    // payload doesn't undo what just happened.
    seeded = null;
  } finally {
    busy = null;
  }
}

export async function add(productId: number, variant?: string | null) {
  await run(productId, () => addToCart({ productId, variant: variant ?? '' }));
}

export async function setQuantity(productId: number, quantity: number, variant?: string | null) {
  await run(productId, () => setCartQuantity({ productId, variant: variant ?? '', quantity }));
}

/* ===== The panel ===== */

export function isOpen(): boolean {
  return open;
}

export function currentView(): CartView {
  return view;
}

export function openCart(next: CartView = 'basket') {
  view = next;
  open = true;
}

export function closeCart() {
  open = false;

  /*
   * Closing a receipt is done with it.
   *
   * The panel opens itself whenever the address carries `?order=`, which is how
   * it survives the trip out to a payment provider and back. That also meant it
   * reopened on the next render and on every reload — closing it did nothing
   * that lasted. Dropping the parameter is what actually dismisses it.
   *
   * `replaceState` rather than a navigation: this isn't a new page, and it
   * shouldn't be somewhere the back button returns to.
   */
  if (view === 'receipt') {
    const url = new URL(page.url);
    if (url.searchParams.has('order')) {
      url.searchParams.delete('order');
      try {
        replaceState(url, page.state);
      } catch {
        // Only throws when the router isn't ready, which can't happen from a
        // click inside a panel the router rendered. Closing still works.
      }
    }
  }

  /*
   * Back to the basket on the way out, so reopening never drops someone into a
   * form they walked away from, or into a receipt they've already dismissed.
   */
  view = 'basket';
}

export function showView(next: CartView) {
  view = next;
}

/** How many things, not how many lines — the badge counts items. */
export function count(): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
