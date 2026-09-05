<script lang="ts">
  import { looksLikeHtml } from '$lib/utils/text';
  import { formatPrice } from '$lib/utils/price';
  import { toast } from '$lib/stores/toast.svelte';
  import * as cart from '$lib/stores/cart.svelte';
  import { variantsOf, stockOf, isSoldOut, variantLabelOf } from '$lib/utils/variants';
  import type { Product } from '$lib/server/schema';

  /**
   * Everything the tile didn't have room for.
   *
   * The shelf shows a picture, a name and a price; this is where the sizes, the
   * pressing details and what's actually in the box go. It can also be bought
   * from, because having opened it to read about something is exactly when
   * someone decides they want it.
   */
  let {
    product,
    locale = 'nb-NO',
    onclose
  }: {
    product: Product;
    locale?: string;
    onclose: () => void;
  } = $props();

  const variants = $derived(variantsOf(product));
  const soldOut = $derived(isSoldOut(product));

  /*
   * Nothing preselected when there's a choice to make.
   *
   * Picking a size for someone is how people end up with the wrong one — and a
   * preselected M that happens to be sold out is worse still. The button says
   * what's missing until they choose.
   */
  let chosen = $state<string | null>(null);

  const variant = $derived(variants.length === 0 ? null : chosen);
  const stock = $derived(stockOf(product, variant));
  const inCart = $derived(
    variants.length === 0 ? cart.quantityOf(product.id, '') : cart.quantityOf(product.id, variant)
  );
  const busy = $derived(cart.busyWith() === product.id);
  const atStockLimit = $derived(stock != null && inCart >= stock);
  const needsChoice = $derived(variants.length > 0 && !chosen);

  async function add() {
    if (needsChoice) return;
    try {
      await cart.add(product.id, variant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that');
    }
  }

  async function setQuantity(quantity: number) {
    try {
      await cart.setQuantity(product.id, quantity, variant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that');
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- The backdrop is the close button, which is what everyone tries first. -->
<div
  class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
  role="presentation"
  onclick={onclose}
>
  <!--
    Bottom sheet on a phone, centred card on a desktop. Same markup — a sheet
    that has to be reached for at the top of a tall screen is a sheet nobody
    closes.
  -->
  <div
    class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border sm:rounded-2xl"
    style="background-color: var(--color-surface); border-color: var(--color-line)"
    role="dialog"
    aria-modal="true"
    aria-label={product.name}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    {#if product.imageUrl}
      <img
        src={product.imageUrl}
        alt={product.name}
        class="aspect-square w-full object-cover {soldOut ? 'opacity-50' : ''}"
      />
    {/if}

    <div class="flex flex-col gap-4 p-5">
      <div>
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-lg font-medium" style="color: var(--color-text)">{product.name}</h2>
          <button
            type="button"
            onclick={onclose}
            class="-mt-1 -mr-1 shrink-0 p-1 transition-opacity hover:opacity-70"
            style="color: var(--color-text-muted)"
            aria-label="Close"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-sm" style="color: var(--color-text-muted)">
          {formatPrice(product.price, product.currency, locale)}
          {#if product.type === 'digital'}
            · Download
          {/if}
        </p>
      </div>

      {#if product.description}
        <!--
          Written in the rich editor, so it arrives as markup — but products
          described before that editor existed are plain text with real line
          breaks in them, and running those through `{@html}` would join the
          lines up. Each is drawn the way it was written.
        -->
        {#if looksLikeHtml(product.description)}
          <div class="product-copy text-sm" style="color: var(--color-text-muted)">
            {@html product.description}
          </div>
        {:else}
          <p class="text-sm whitespace-pre-line" style="color: var(--color-text-muted)">
            {product.description}
          </p>
        {/if}
      {/if}

      {#if variants.length > 0}
        <div>
          <span
            class="mb-2 block text-xs tracking-wide uppercase"
            style="color: var(--color-text-muted)"
          >
            Size
          </span>
          <div class="flex flex-wrap gap-2">
            {#each variants as option (option.name)}
              {@const out = option.stock === 0}
              <!-- A sold-out size stays visible but can't be picked. Removing it
                   makes people wonder whether it was ever made. -->
              <button
                type="button"
                disabled={out}
                onclick={() => (chosen = option.name)}
                class="min-w-12 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40"
                style={chosen === option.name
                  ? 'background: var(--color-accent); border-color: var(--color-accent); color: var(--color-on-accent)'
                  : 'border-color: var(--color-line); color: var(--color-text)'}
              >
                {option.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Only when it's running out. "42 left" on a stack of 42 is noise; "2
           left" is the reason someone buys today. -->
      {#if stock != null && stock > 0 && stock <= 5}
        <p class="text-sm" style="color: var(--color-accent)">
          Only {stock} left{variant ? ` in ${variant}` : ''}
        </p>
      {/if}

      {#if soldOut}
        <span
          class="rounded-lg px-4 py-3 text-center text-sm font-medium"
          style="background-color: var(--color-well); color: var(--color-text-muted)"
        >
          Sold out
        </span>
      {:else if product.price == null}
        {#if product.externalUrl}
          <a
            href={product.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg px-4 py-3 text-center text-sm font-medium transition-opacity hover:opacity-90"
            style="background: var(--color-accent); color: var(--color-on-accent)"
          >
            Enquire
          </a>
        {/if}
      {:else if inCart > 0}
        <div
          class="flex items-center justify-between rounded-lg px-2 py-1"
          style="background-color: var(--color-well)"
        >
          <button
            onclick={() => setQuantity(inCart - 1)}
            disabled={busy}
            class="h-10 w-10 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
            style="color: var(--color-text)"
            aria-label="One fewer"
          >
            −
          </button>
          <span class="text-sm tabular-nums" style="color: var(--color-text)">
            {inCart} in the basket{variant ? ` · ${variant}` : ''}
          </span>
          <button
            onclick={() => setQuantity(inCart + 1)}
            disabled={busy || atStockLimit}
            class="h-10 w-10 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
            style="color: var(--color-text)"
            aria-label="One more"
          >
            +
          </button>
        </div>
      {:else}
        <button
          onclick={add}
          disabled={busy || needsChoice}
          class="rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style="background: var(--color-accent); color: var(--color-on-accent)"
        >
          {#if needsChoice}
            Choose a {variantLabelOf(product).toLowerCase()}
          {:else if busy}
            Adding…
          {:else}
            Add to basket
          {/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Paragraphs, the way the bio block spaces them. */
  .product-copy :global(p + p) {
    margin-top: 0.5rem;
  }
</style>
