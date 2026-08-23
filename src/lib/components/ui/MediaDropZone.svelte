<script lang="ts">
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
    footer,
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
    footer?: Snippet;
    emptyLabel?: string;
  } = $props();

  let dragOver = $state(false);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;

    const id = Number(e.dataTransfer?.getData('text/plain'));
    if (!id) return;
    // Dropping something already in the set is a no-op, not an error.
    if (items.some((item) => item.id === id)) return;
    ondropmedia(id);
  }
</script>

<section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
  <div class="mb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      {#if icon}
        {@render icon()}
      {/if}
      <div>
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
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    class="h-[124px] overflow-x-auto rounded-lg border-2 border-dashed transition-colors {dragOver
      ? 'border-violet-500 bg-violet-500/10'
      : 'border-gray-700'}"
  >
    {#if items.length === 0}
      <div class="flex h-full flex-col items-center justify-center text-gray-500">
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
              <img
                src={item.thumbnailUrl || item.url}
                alt={item.filename}
                loading="lazy"
                class="h-full w-full object-cover"
              />
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

  {#if footer}
    {@render footer()}
  {/if}
</section>
