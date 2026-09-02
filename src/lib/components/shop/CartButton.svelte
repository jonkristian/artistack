<script lang="ts">
  import * as cart from '$lib/stores/cart.svelte';

  /**
   * The basket, floating over whatever you're looking at.
   *
   * Only once there's something in it. A permanent empty basket is furniture
   * that covers the bottom corner of every page for the whole visit, and it
   * appearing is itself the confirmation that adding something worked.
   *
   * It toggles, because a button that only opens is a trap once the thing it
   * opened is covering it. On a phone it hides while the sheet is up — the
   * sheet comes from the same corner and would bury it anyway.
   */
  const count = $derived(cart.count());
  const open = $derived(cart.isOpen());
</script>

{#if count > 0}
  <button
    type="button"
    onclick={() => (open ? cart.closeCart() : cart.openCart('basket'))}
    class="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 {open
      ? 'max-sm:hidden'
      : ''}"
    style="background: var(--color-accent); color: var(--color-on-accent)"
    aria-expanded={open}
    aria-label="Basket, {count} {count === 1 ? 'item' : 'items'}"
  >
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>

    <!--
      The count sits on the rim rather than inside, in a deepened version of the
      accent — so it reads as part of the button rather than a sticker on it,
      and still separates from it whatever the accent has been set to. Derived
      rather than a fixed purple: change the accent in Appearance and this
      follows.
    -->
    <span
      class="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
      style="background-color: var(--color-accent-deep); color: var(--color-text)"
    >
      {count}
    </span>
  </button>
{/if}
