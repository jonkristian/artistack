<script lang="ts" generics="T extends { id: number }">
  /**
   * A reorderable list, dragged by an element marked `data-drag-handle`.
   *
   * Built on pointer events rather than HTML5 drag-and-drop. The old version
   * armed `draggable` on mousedown and let the browser take over, which meant
   * reordering simply didn't exist on a phone: touch devices never fire
   * `mousedown`, and HTML5 drag has no touch equivalent. Pointer events are one
   * code path for mouse, touch and pen.
   *
   * `touch-action: none` on the handle is what stops a drag from scrolling the
   * page instead — without it the browser claims the gesture before we see it.
   */
  import type { Snippet } from 'svelte';
  import { suppressContextMenu } from '$lib/utils/drag';

  let {
    items = $bindable([]),
    onreorder,
    gap = '0.25rem',
    children
  }: {
    items: T[];
    onreorder?: (items: T[]) => void;
    /**
     * Space between rows, as a CSS length rather than a class: the drop line
     * centres itself in this gap, so the number has to be readable from CSS.
     */
    gap?: string;
    children: Snippet<[T]>;
  } = $props();

  let draggedIndex = $state<number | null>(null);

  /**
   * Where the item would land, as a single insertion point from 0 to n.
   *
   * This used to be `{ index, position: 'before' | 'after' }`, which gave the
   * *same* gap two names — "after row 3" and "before row 4" — and so two
   * slightly different indicators for one place. An index counts the gaps
   * instead of the rows, so each gap has exactly one representation.
   */
  let insertAt = $state<number | null>(null);

  let listEl: HTMLElement;
  let releaseContextMenu: (() => void) | null = null;

  function handlePointerDown(e: PointerEvent, index: number) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;

    // Only the primary button, and never a right-click.
    if (e.button !== 0) return;

    e.preventDefault();
    draggedIndex = index;
    releaseContextMenu = suppressContextMenu();

    // Capture on the handle so the drag survives the pointer leaving the row —
    // which it always does, because the row is what's moving. Best-effort:
    // capture can throw if the pointer is already gone, and losing the drag
    // over that is worse than dragging without it.
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Fall through: the listeners below still track the gesture.
    }
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', cancel);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggedIndex === null) return;
    e.preventDefault();

    // The row under the pointer, found by hit-testing rather than by listening
    // on each row: with the pointer captured, only the handle gets events.
    const rows = [...listEl.querySelectorAll<HTMLElement>(':scope > .sortable-item')];
    const hit = rows.findIndex((row) => {
      const r = row.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });

    if (hit === -1) {
      // Past either end of the list: aim for the nearer edge.
      const first = rows[0]?.getBoundingClientRect();
      const last = rows.at(-1)?.getBoundingClientRect();
      if (first && e.clientY < first.top) insertAt = 0;
      else if (last && e.clientY > last.bottom) insertAt = rows.length;
      return;
    }

    const rect = rows[hit].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    insertAt = e.clientY < midpoint ? hit : hit + 1;
  }

  function detach(e: PointerEvent) {
    releaseContextMenu?.();
    releaseContextMenu = null;

    const target = e.target as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      // Never captured, or already released.
    }
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', cancel);
  }

  function finish(e: PointerEvent) {
    detach(e);

    if (draggedIndex === null || insertAt === null) return reset();

    // Removing the item first shifts everything after it down by one.
    const targetIndex = draggedIndex < insertAt ? insertAt - 1 : insertAt;
    if (draggedIndex === targetIndex) return reset();

    const next = [...items];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);

    items = next;
    onreorder?.(next);
    reset();
  }

  function cancel(e: PointerEvent) {
    detach(e);
    reset();
  }

  function reset() {
    draggedIndex = null;
    insertAt = null;
  }

  /**
   * The line is drawn above the row at the insertion point, or below the last
   * row for the very end. Gaps either side of the dragged item are where it
   * already is, so they show nothing.
   */
  function dropClass(index: number): string {
    if (insertAt === null || draggedIndex === null) return '';
    if (insertAt === draggedIndex || insertAt === draggedIndex + 1) return '';
    if (insertAt === index) return 'drop-before';
    if (insertAt === items.length && index === items.length - 1) return 'drop-after';
    return '';
  }
</script>

<div
  bind:this={listEl}
  class="sortable-list"
  style="--sortable-gap: {gap}"
  role="list"
  aria-label="Sortable list"
>
  {#each items as item, index (item.id)}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      onpointerdown={(e) => handlePointerDown(e, index)}
      class="sortable-item {dropClass(index)}"
      class:dragging={draggedIndex === index}
      role="listitem"
    >
      {@render children(item)}
    </div>
  {/each}
</div>

<style>
  .sortable-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sortable-gap);
  }

  .sortable-item {
    position: relative;
    transition: opacity 0.15s ease;
  }

  .sortable-item.dragging {
    opacity: 0.4;
  }

  /* Centred in the gap: half the gap out from the row's edge, then back by
     half the line's own height. */
  .sortable-item.drop-before::before,
  .sortable-item.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #8b5cf6;
    border-radius: 1px;
  }

  .sortable-item.drop-before::before {
    top: calc(var(--sortable-gap) / -2 - 1px);
  }

  .sortable-item.drop-after::after {
    bottom: calc(var(--sortable-gap) / -2 - 1px);
  }

  /* touch-action is the load-bearing part: without it a touch drag scrolls. */
  :global([data-drag-handle]) {
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    /* Stops iOS raising its own long-press callout over the drag. */
    -webkit-touch-callout: none;
  }

  :global([data-drag-handle]:active) {
    cursor: grabbing;
  }
</style>
