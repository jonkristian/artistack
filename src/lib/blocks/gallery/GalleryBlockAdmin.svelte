<script lang="ts">
  import type { Block, Media, GalleryBlockConfig } from '$lib/server/schema';
  import { MediaPicker } from '$lib/components/ui';
  import { suppressContextMenu } from '$lib/utils/drag';

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

  /**
   * Reordering by pointer rather than HTML5 drag, so it works on a phone.
   *
   * Not SortableList: that one drags rows by a handle and drops between them,
   * while this is a wrapping grid of thumbnails dragged whole and dropped onto
   * a position. Sharing it would mean two layout modes in a component three
   * other places depend on.
   */
  const DRAG_THRESHOLD = 6;

  function handlePointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const target = e.currentTarget as HTMLElement;
    let armed = false;
    const releaseContextMenu = suppressContextMenu();

    const move = (ev: PointerEvent) => {
      if (!armed) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        armed = true;
        dragIndex = index;
        try {
          target.setPointerCapture(ev.pointerId);
        } catch {
          // Best-effort; the listeners still track the gesture.
        }
      }

      // Capture sends every move here, so the tile under the pointer has to be
      // found by hit-testing.
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tile = under?.closest<HTMLElement>('[data-gallery-index]');
      dropTarget = tile ? Number(tile.dataset.galleryIndex) : null;
    };

    const finish = (ev: PointerEvent) => {
      releaseContextMenu();
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // Never captured, or already released.
      }

      if (armed && dragIndex !== null && dropTarget !== null && dragIndex !== dropTarget) {
        const newIds = [...selectedIds];
        const [moved] = newIds.splice(dragIndex, 1);
        newIds.splice(dropTarget, 0, moved);
        block.config = { ...config, mediaIds: newIds };
      }

      dragIndex = null;
      dropTarget = null;
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }
</script>

{#if selectedMedia.length > 0}
  <div class="space-y-3">
    <span class="block text-sm text-gray-400">Gallery order</span>
    <div class="flex flex-wrap gap-2">
      {#each selectedMedia as item, i (item.id)}
        <div
          class="group relative h-16 w-16 shrink-0 cursor-grab touch-none overflow-hidden rounded-lg transition-opacity {dragIndex ===
          i
            ? 'opacity-40'
            : ''} {dropTarget === i && dragIndex !== i ? 'ring-2 ring-violet-500' : ''}"
          data-gallery-index={i}
          onpointerdown={(e) => handlePointerDown(e, i)}
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
            class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
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
    <svg class="mb-2 h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  {selectedIds}
  onmultiselect={handleMultiSelect}
/>
