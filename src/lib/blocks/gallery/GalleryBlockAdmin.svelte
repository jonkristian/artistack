<script lang="ts">
  import type { Block, Media, GalleryBlockConfig } from '$lib/server/schema';
  import { MediaPicker } from '$lib/components/ui';

  let {
    block,
    media
  }: {
    block: Block;
    media: Media[];
  } = $props();

  const config = $derived((block.config as GalleryBlockConfig) ?? {});
  const selectedIds = $derived(config.mediaIds ?? []);

  // Build a lookup for quick thumbnail access
  const mediaMap = $derived(new Map(media.map((m) => [m.id, m])));
  const selectedMedia = $derived(
    selectedIds.map((id) => mediaMap.get(id)).filter((m): m is Media => !!m)
  );

  let showPicker = $state(false);

  // Drag-and-drop reorder state
  let dragIndex = $state<number | null>(null);
  let dropTarget = $state<number | null>(null);

  function handleMultiSelect(ids: number[]) {
    block.config = { ...config, mediaIds: ids };
  }

  function removeImage(id: number) {
    block.config = { ...config, mediaIds: selectedIds.filter((i) => i !== id) };
  }

  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dropTarget = index;
  }

  function handleDragLeave() {
    dropTarget = null;
  }

  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      const newIds = [...selectedIds];
      const [moved] = newIds.splice(dragIndex, 1);
      newIds.splice(index, 0, moved);
      block.config = { ...config, mediaIds: newIds };
    }
    dragIndex = null;
    dropTarget = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dropTarget = null;
  }
</script>

{#if selectedMedia.length > 0}
  <div class="space-y-3">
    <span class="block text-sm text-gray-400">Gallery order</span>
    <div class="flex flex-wrap gap-2">
      {#each selectedMedia as item, i (item.id)}
        <div
          class="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg transition-opacity {dragIndex ===
          i
            ? 'opacity-40'
            : ''} {dropTarget === i && dragIndex !== i ? 'ring-2 ring-violet-500' : ''}"
          draggable="true"
          ondragstart={(e) => handleDragStart(e, i)}
          ondragover={(e) => handleDragOver(e, i)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, i)}
          ondragend={handleDragEnd}
          role="listitem"
        >
          <img
            src={item.thumbnailUrl || item.url}
            alt={item.alt || item.filename}
            class="h-full w-full object-cover"
            draggable="false"
          />
          <button
            type="button"
            onclick={() => removeImage(item.id)}
            class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-gray-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
            aria-label="Remove {item.alt || item.filename}"
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
    <button
      type="button"
      onclick={() => (showPicker = true)}
      class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
    >
      Select images ({selectedIds.length} selected)
    </button>
  </div>
{:else}
  <button
    type="button"
    onclick={() => (showPicker = true)}
    class="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 px-4 py-8 text-center transition-colors hover:border-gray-500"
  >
    <svg
      class="mb-2 h-8 w-8 text-gray-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
    <span class="text-sm text-gray-400">Select images</span>
  </button>
{/if}

<MediaPicker
  label="Gallery"
  {media}
  multiple
  bind:open={showPicker}
  selectedIds={selectedIds}
  onmultiselect={handleMultiSelect}
/>
