<script lang="ts">
  /**
   * Making something, behind one button.
   *
   * Three side-by-side buttons wrapped onto two rows on a phone and pushed the
   * calendar down with them, and adding a fourth for shows would have made it
   * three rows. One menu is one row at any width — and it pairs with Waiting on
   * the other side of the bar, which is the same shape: a button that opens a
   * short list.
   *
   * An entry per section that can actually make something, so a site with the
   * shop or clips switched off doesn't offer to make one.
   */
  import { Icon, Plus, ChevronDown } from 'svelte-hero-icons';
  import type { Snippet } from 'svelte';

  export interface NewAction {
    key: string;
    label: string;
    /** A link for the ones that open a form, a callback for the ones that don't. */
    href?: string;
    run?: () => void;
    icon: Snippet;
    busy?: boolean;
  }

  let { actions, label = 'New' }: { actions: NewAction[]; label?: string } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  /**
   * Closes on a click elsewhere without swallowing it, like the filter menu.
   * Bubble phase, so the trigger's own handler has already run and
   * `root.contains` sees it as inside.
   */
  function handleWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={(e) => {
    if (e.key === 'Escape') open = false;
  }}
/>

<div class="relative" bind:this={root}>
  <button
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-haspopup="true"
    class="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:text-white"
  >
    <Icon src={Plus} size="16" />
    {label}
    <Icon src={ChevronDown} size="14" />
  </button>

  {#if open}
    <div
      class="absolute left-0 z-30 mt-2 w-56 rounded-xl border border-gray-800 bg-gray-900 p-1.5 shadow-xl"
    >
      {#each actions as item (item.key)}
        {#if item.href}
          <a
            href={item.href}
            class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            {@render item.icon()}
            {item.label}
          </a>
        {:else}
          <button
            onclick={() => {
              open = false;
              item.run?.();
            }}
            disabled={item.busy}
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
          >
            {@render item.icon()}
            {item.busy ? 'Creating…' : item.label}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
