<script lang="ts">
  /**
   * A filter as one control rather than a row of pills.
   *
   * Six tabs cost a whole row and still only let you see one slice at a time.
   * A menu is a single button until you need it, and multi-select means
   * "images and documents" is one filter rather than two visits.
   *
   * Empty options stay listed but disabled: knowing there are no documents yet
   * is worth more than a shorter list, and a menu whose contents change shape
   * is hard to build a habit around.
   */
  export interface FilterOption {
    key: string;
    label: string;
    count: number;
  }

  let {
    options,
    selected = $bindable([]),
    allLabel = 'All',
    total,
    onchange
  }: {
    options: FilterOption[];
    /** Empty means everything — there's no separate "all" entry to keep in sync. */
    selected?: string[];
    allLabel?: string;
    total: number;
    onchange?: (selected: string[]) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  const chosen = $derived(options.filter((o) => selected.includes(o.key)));

  const summary = $derived(
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen.length} types`
  );

  const shownCount = $derived(
    chosen.length === 0 ? total : chosen.reduce((sum, o) => sum + o.count, 0)
  );

  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    selected = next;
    onchange?.(next);
  }

  function clear() {
    selected = [];
    onchange?.([]);
  }

  /**
   * Closes on a click elsewhere without swallowing it — the click still reaches
   * whatever it was aimed at. Bubble phase, so the trigger's own handler has
   * already run and `root.contains` sees it as inside.
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
    class="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm whitespace-nowrap text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
  >
    <svg
      class="h-3.5 w-3.5 shrink-0 text-gray-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
    {summary}
    <span class="text-gray-500 tabular-nums">{shownCount}</span>
    <svg
      class="h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform {open ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-gray-700 bg-gray-900 p-1 shadow-2xl"
    >
      <button
        onclick={clear}
        class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-800 {chosen.length ===
        0
          ? 'text-white'
          : 'text-gray-400'}"
      >
        <span>{allLabel}</span>
        <span class="text-gray-500 tabular-nums">{total}</span>
      </button>

      <div class="my-1 border-t border-gray-800"></div>

      {#each options as option (option.key)}
        <button
          onclick={() => toggle(option.key)}
          disabled={option.count === 0}
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded border {selected.includes(
              option.key
            )
              ? 'border-violet-500 bg-violet-600 text-white'
              : 'border-gray-600'}"
          >
            {#if selected.includes(option.key)}
              <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            {/if}
          </span>
          <span class="flex-1 text-left text-gray-300">{option.label}</span>
          <span class="text-gray-500 tabular-nums">{option.count}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
