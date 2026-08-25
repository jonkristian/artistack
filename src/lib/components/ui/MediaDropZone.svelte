<script lang="ts">
  import { mediaDrag } from '$lib/stores/mediaDrag.svelte';
  import type { Snippet } from 'svelte';
  import type { Media } from '$lib/server/schema';

  /**
   * A panel on the Media page that collects a subset of the library by drag and
   * drop — the press kit, the clip graphics, anything else that's "a chosen set
   * of files" rather than a separate store.
   *
   * Membership is a pointer, so a file stays an ordinary library image and can
   * belong to several sets at once. Callers own persistence; this only reports
   * what was dropped or removed.
   */
  let {
    title,
    description,
    items,
    ondropmedia,
    onremove,
    icon,
    actions,
    overlay,
    emptyLabel = 'Drag files from below to add them'
  }: {
    title: string;
    description: string;
    items: Media[];
    ondropmedia: (mediaId: number) => void;
    onremove: (mediaId: number) => void;
    icon?: Snippet;
    actions?: Snippet;
    /** Drawn over each tile — a badge, a per-item control. */
    overlay?: Snippet<[Media]>;
    emptyLabel?: string;
  } = $props();

  // The title doubles as this zone's key: there are two of them on one page and
  // they're already distinct by name.
  const key = $derived(title);

  $effect(() =>
    mediaDrag.register(key, (id) => {
      // Dropping something already in the set is a no-op, not an error.
      if (items.some((item) => item.id === id)) return;
      ondropmedia(id);
    })
  );

  const dragOver = $derived(mediaDrag.dragging !== null && mediaDrag.overZone === key);
</script>

<section
  class="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-[clamp(0.875rem,3vw,1.25rem)]"
>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-3">
      {#if icon}
        {@render icon()}
      {/if}
      <div class="min-w-0">
        <h2 class="font-semibold text-white">{title}</h2>
        <p class="text-xs text-gray-500">{description}</p>
      </div>
    </div>
    {#if actions}
      <div class="flex items-center gap-3">
        {@render actions()}
      </div>
    {/if}
  </div>

  <!-- One row, always: a non-wrapping strip that scrolls sideways when it runs
       out of width. The browser decides what fits, so nothing here restates the
       tile size. Height is 12 padding + 80 tile + 12 padding, plus 4 for the
       dashed border that border-box would otherwise eat, plus room for the
       horizontal scrollbar — fixed so both zones line up whatever they hold. -->
  <div
    role="region"
    aria-label="{title} drop zone"
    data-drop-zone={key}
    class="overflow-x-auto rounded-lg border-2 border-dashed transition-colors {dragOver
      ? 'border-violet-500 bg-violet-500/10'
      : 'border-gray-700'}"
  >
    {#if items.length === 0}
      <div class="flex flex-col items-center justify-center py-7 text-gray-500">
        <svg class="mb-2 h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p class="text-sm">{emptyLabel}</p>
      </div>
    {:else}
      <div class="flex flex-nowrap gap-3 p-3">
        {#each items as item (item.id)}
          <div class="group relative shrink-0">
            <div class="h-20 w-20 overflow-hidden rounded-lg bg-gray-800">
              {#if item.role === 'document'}
                <!-- Nothing to show a thumbnail of, so show what it is. -->
                <div class="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
                  <svg
                    class="h-7 w-7 text-violet-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span class="text-[9px] tracking-wider text-gray-400 uppercase">
                    {item.filename.split('.').pop()}
                  </span>
                </div>
              {:else}
                <img
                  src={item.thumbnailUrl || item.url}
                  alt={item.filename}
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
              {/if}
            </div>
            {#if overlay}
              {@render overlay(item)}
            {/if}
            <!-- Inside the tile, not overhanging it: the scroll container would
                 clip a negative offset and count it as overflow, which is what
                 made two rows scroll. -->
            <button
              onclick={() => onremove(item.id)}
              class="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
              aria-label="Remove {item.filename}"
            >
              <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
