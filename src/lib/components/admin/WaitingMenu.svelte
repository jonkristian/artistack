<script lang="ts">
  /**
   * Everything waiting on you that has no date, behind one control.
   *
   * The calendar beside this answers "what's coming". It cannot answer "what's
   * unfinished", because a draft clip, an unpublished page and an order to post
   * have no date to be drawn on — the calendar would have to invent one. So
   * they live here instead, as one list rather than the four cards this
   * replaced: they are the same kind of thing, and a card each said so four
   * times over.
   *
   * A menu rather than a panel because most days it's a number you glance at.
   * It opens when the number bothers you.
   */
  export interface WaitingItem {
    key: string;
    kind: string;
    label: string;
    detail: string | null;
    href: string;
    thumbnailUrl: string | null;
    /** Tailwind class for the marker dot, from the caller's own palette. */
    dot: string;
  }

  let { items, label = 'Waiting' }: { items: WaitingItem[]; label?: string } = $props();

  let open = $state(false);
  let query = $state('');
  let root = $state<HTMLElement | null>(null);
  let field = $state<HTMLInputElement | null>(null);

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.kind.toLowerCase().includes(q) ||
        (i.detail ?? '').toLowerCase().includes(q)
    );
  });

  /** Grouped so a long list reads as sections rather than one run of rows. */
  const groups = $derived.by(() => {
    const map = new Map<string, WaitingItem[]>();
    for (const item of shown) {
      const list = map.get(item.kind);
      if (list) list.push(item);
      else map.set(item.kind, [item]);
    }
    return [...map.entries()];
  });

  async function toggleOpen() {
    open = !open;
    if (!open) return;
    query = '';
    // Typing is the point of opening it, so the caret starts in the field.
    await Promise.resolve();
    field?.focus();
  }

  /**
   * Closes on a click elsewhere without swallowing it, the same way the filter
   * menu does — bubble phase, so the trigger's own handler has already run.
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
    onclick={toggleOpen}
    aria-expanded={open}
    aria-haspopup="true"
    disabled={items.length === 0}
    class="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:text-white disabled:opacity-50"
  >
    {label}
    <span
      class="grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs {items.length
        ? 'bg-violet-600 text-white'
        : 'bg-gray-800 text-gray-500'}"
    >
      {items.length}
    </span>
  </button>

  {#if open}
    <div
      class="absolute right-0 z-30 mt-2 max-h-96 w-80 overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-2 shadow-xl"
    >
      <input
        bind:this={field}
        bind:value={query}
        placeholder="Filter…"
        aria-label="Filter what's waiting"
        class="mb-2 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-700 focus:outline-none"
      />

      {#if groups.length === 0}
        <p class="px-2 py-6 text-center text-sm text-gray-600">Nothing matches</p>
      {:else}
        {#each groups as [kind, list] (kind)}
          <div class="px-2 pt-2 pb-1 text-xs tracking-wider text-gray-600 uppercase">
            {kind}
          </div>
          {#each list as item (item.key)}
            <a
              href={item.href}
              class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-800"
            >
              {#if item.thumbnailUrl}
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  class="h-8 w-6 shrink-0 rounded object-cover"
                />
              {:else}
                <span class="grid h-8 w-6 shrink-0 place-items-center">
                  <span class="h-2 w-2 rounded-full {item.dot}"></span>
                </span>
              {/if}
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-white">{item.label}</span>
                {#if item.detail}
                  <span class="block truncate text-xs text-gray-500">{item.detail}</span>
                {/if}
              </span>
            </a>
          {/each}
        {/each}
      {/if}
    </div>
  {/if}
</div>
