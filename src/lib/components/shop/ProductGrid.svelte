<script lang="ts">
  import ProductCard from './ProductCard.svelte';
  import ProductDialog from './ProductDialog.svelte';
  import type { Product } from '$lib/server/schema';

  /**
   * The shelf.
   *
   * Owns the details dialog rather than each tile owning one, so opening a
   * second closes the first and there is only ever one mounted.
   */
  let {
    products,
    locale = 'nb-NO',
    showPrice = true,
    columns = 3
  }: {
    products: Product[];
    locale?: string;
    showPrice?: boolean;
    /** How many across on a wide screen. Phones get two, always. */
    columns?: 2 | 3 | 4;
  } = $props();

  /* The id, not the product: held by reference it would go stale the moment a
     quantity changed, and the dialog reads live stock. */
  let openedId = $state<number | null>(null);

  /*
   * Two across on a phone whatever the setting says.
   *
   * Four tiles across a 375px screen is about 80px each, and a name and a price
   * laid over that is unreadable — the layout would be denser and useless. The
   * breakpoint does it, so nothing has to measure anything.
   */
  const gridClass = $derived(
    {
      2: 'grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-4'
    }[columns]
  );

  /*
   * The dialog is looked up again on every render rather than held as a copy,
   * so a quantity changed from inside it stays in step with the tile behind.
   */
  const openedProduct = $derived(products.find((p) => p.id === openedId) ?? null);
</script>

<ul class="grid gap-3 {gridClass}">
  {#each products as product (product.id)}
    <li>
      <ProductCard {product} {locale} {showPrice} ondetails={(p) => (openedId = p.id)} />
    </li>
  {/each}
</ul>

{#if openedProduct}
  <ProductDialog product={openedProduct} {locale} onclose={() => (openedId = null)} />
{/if}
