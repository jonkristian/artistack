<script lang="ts">
  import CartButton from './CartButton.svelte';
  import CartPanel from './CartPanel.svelte';
  import * as cart from '$lib/stores/cart.svelte';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import type { CartLine } from '$lib/server/cart';

  /**
   * The basket, everywhere.
   *
   * Mounted once in the root layout rather than by whatever happens to be
   * showing products, so the button and the panel survive moving between pages
   * and there's only ever one of each. Renders nothing at all when the shop is
   * off or the basket is empty.
   */
  let {
    cart: serverCart,
    enabled = false,
    locale = 'nb-NO'
  }: {
    cart?: { lines: CartLine[]; total: number };
    enabled?: boolean;
    locale?: string;
  } = $props();

  $effect(() => {
    if (serverCart) cart.seed(serverCart);
  });

  /*
   * Coming back from paying. The provider's redirect lands on a page with the
   * order named in the address, which is the only thing left of the panel that
   * was open when they left — so it opens itself, showing the receipt.
   *
   * Once per order, and the store is what remembers: this effect re-runs
   * whenever the page object is rebuilt, and `page.url` keeps the parameter
   * even after the address bar has lost it, so an unguarded call reopened a
   * dismissed receipt out of nowhere.
   */
  const reference = $derived(page.url.searchParams.get('order'));
  $effect(() => {
    if (reference) cart.openReceipt(reference);
  });
</script>

<!--
  `browser` as well as `enabled`: the basket lives in a module-level store, which
  on the server is shared by every request at once. Drawing it during server
  rendering would mean rendering one visitor's basket into another's page.
-->
{#if enabled && browser}
  <CartButton />
  <CartPanel {locale} />
{/if}
