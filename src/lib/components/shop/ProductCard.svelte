<script lang="ts">
  import { formatPrice } from '$lib/utils/price';
  import { toast } from '$lib/stores/toast.svelte';
  import * as cart from '$lib/stores/cart.svelte';
  import { hasVariants, isSoldOut, variantLabelOf } from '$lib/utils/variants';
  import type { Product } from '$lib/server/schema';

  /**
   * One thing for sale: the picture, with everything else over the top of it.
   *
   * Words under a tile push the next row down and make a grid of four look like
   * a spreadsheet. Over the picture, the row stays a row — and anything longer
   * than a name and a price belongs in the dialog rather than on the shelf.
   */
  let {
    product,
    locale = 'nb-NO',
    showPrice = true,
    ondetails
  }: {
    product: Product;
    locale?: string;
    showPrice?: boolean;
    /** Given a way to open the details, the tile offers one. */
    ondetails?: (product: Product) => void;
  } = $props();

  const soldOut = $derived(isSoldOut(product));
  /** Across every size — the tile counts the product, the dialog counts sizes. */
  const inCart = $derived(cart.quantityOf(product.id));
  const busy = $derived(cart.busyWith() === product.id);
  const atStockLimit = $derived(product.stock != null && inCart >= product.stock);
  /** A size has to be chosen, and a tile is too small to choose one on. */
  const needsChoice = $derived(hasVariants(product));
  /** Something to open a dialog for: a description, or a size to pick. */
  const hasDetails = $derived(!!product.description || needsChoice);

  async function add() {
    try {
      await cart.add(product.id);
      // Opening the panel here would cover the shelf the moment anyone used it.
      // The badge appearing is enough to say something happened.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that');
    }
  }

  async function setQuantity(quantity: number) {
    try {
      await cart.setQuantity(product.id, quantity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that');
    }
  }
</script>

<div
  class="group relative aspect-square overflow-hidden rounded-xl"
  style="background-color: var(--color-surface)"
>
  {#if product.imageUrl}
    <img
      src={product.imageUrl}
      alt={product.name}
      loading="lazy"
      class="h-full w-full object-cover {soldOut ? 'opacity-40' : ''}"
    />
  {/if}

  <!-- A wash rather than a flat panel: the name has to stay legible over a
       photo that could be any colour, without hiding the photo. -->
  <div
    class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
    style="background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.35) 45%, transparent)"
  ></div>

  {#if hasDetails && ondetails}
    <!-- Top corner, away from the buy control at the bottom: the two shouldn't
         be a coin flip under a thumb. -->
    <button
      type="button"
      onclick={() => ondetails?.(product)}
      class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-opacity hover:bg-black/70"
      aria-label="Details for {product.name}"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  {/if}

  <div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-2.5">
    <div class="min-w-0">
      <p class="truncate text-sm font-medium text-white">{product.name}</p>
      {#if showPrice}
        <p class="text-xs text-white/70">
          {formatPrice(product.price, product.currency, locale)}
        </p>
      {/if}
    </div>

    <!-- Sold out replaces the button rather than sitting beside it: a buy link
         that can't be honoured is worse than none. -->
    {#if soldOut}
      <span
        class="rounded-lg bg-white/15 px-2 py-1.5 text-center text-xs font-medium text-white/80"
      >
        Sold out
      </span>
    {:else if product.price == null}
      <!-- No price, no basket: "ask" is a conversation, not a transaction. -->
      {#if product.externalUrl}
        <a
          href={product.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-opacity hover:opacity-90"
          style="background: var(--color-accent); color: var(--color-on-accent)"
        >
          Enquire
        </a>
      {/if}
    {:else if needsChoice}
      <!-- Options are chosen in the dialog. A picker on an 80px tile would be
           four unlabelled squares, and guessing for someone is worse than one
           more tap. -->
      <button
        onclick={() => ondetails?.(product)}
        class="rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-opacity hover:opacity-90"
        style="background: var(--color-accent); color: var(--color-on-accent)"
      >
        {inCart > 0
          ? `${inCart} in basket · Choose`
          : `Choose ${variantLabelOf(product).toLowerCase()}`}
      </button>
    {:else if inCart > 0}
      <!-- Once it's in, the button becomes the quantity: adding the same thing
           twice should raise the number, not make a second line. -->
      <div class="flex items-center justify-between rounded-lg bg-white/15 px-1">
        <button
          onclick={() => setQuantity(inCart - 1)}
          disabled={busy}
          class="h-7 w-7 rounded text-white transition-opacity hover:opacity-70 disabled:opacity-40"
          aria-label="One fewer {product.name}"
        >
          −
        </button>
        <span class="text-xs font-medium text-white tabular-nums">{inCart}</span>
        <button
          onclick={() => setQuantity(inCart + 1)}
          disabled={busy || atStockLimit}
          class="h-7 w-7 rounded text-white transition-opacity hover:opacity-70 disabled:opacity-40"
          aria-label="One more {product.name}"
        >
          +
        </button>
      </div>
    {:else}
      <button
        onclick={add}
        disabled={busy}
        class="rounded-lg px-2 py-1.5 text-center text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style="background: var(--color-accent); color: var(--color-on-accent)"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
    {/if}
  </div>
</div>
