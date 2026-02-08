<script lang="ts" generics="T extends { id: number }">
  import type { Snippet } from 'svelte';

  let {
    items = $bindable([]),
    onreorder,
    children
  }: {
    items: T[];
    onreorder?: (items: T[]) => void;
    children: Snippet<[T]>;
  } = $props();

  let draggedIndex: number | null = $state(null);
  let dropPosition: { index: number; position: 'before' | 'after' } | null = $state(null);
  let draggableIndex: number | null = $state(null);

  function handleMouseDown(e: MouseEvent, index: number) {
    const target = e.target as HTMLElement;
    const isOnHandle = !!target.closest('[data-drag-handle]');
    draggableIndex = isOnHandle ? index : null;
  }

  function handleMouseUp() {
    if (draggedIndex === null) {
      draggableIndex = null;
    }
  }

  function handleDragStart(e: DragEvent, index: number) {
    if (draggableIndex !== index) {
      e.preventDefault();
      return;
    }

    draggedIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (draggedIndex === null) return;
    e.preventDefault();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? 'before' : 'after';

    dropPosition = { index, position };
  }

  function handleDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget?.closest('.sortable-list')) {
      dropPosition = null;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();

    if (draggedIndex === null || !dropPosition) {
      reset();
      return;
    }

    let targetIndex = dropPosition.index;
    if (dropPosition.position === 'after') {
      targetIndex += 1;
    }

    if (draggedIndex < targetIndex) {
      targetIndex -= 1;
    }

    if (draggedIndex === targetIndex) {
      reset();
      return;
    }

    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, removed);

    items = newItems;
    onreorder?.(newItems);
    reset();
  }

  function handleDragEnd() {
    reset();
  }

  function reset() {
    draggedIndex = null;
    dropPosition = null;
    draggableIndex = null;
  }

  function getDropClass(index: number): string {
    if (!dropPosition || draggedIndex === null) return '';
    if (dropPosition.index === index && dropPosition.index !== draggedIndex) {
      return dropPosition.position === 'before' ? 'drop-before' : 'drop-after';
    }
    return '';
  }
</script>

<div
  class="sortable-list space-y-1"
  ondrop={handleDrop}
  ondragover={(e) => e.preventDefault()}
  role="list"
  aria-label="Sortable list"
>
  {#each items as item, index (item.id)}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      draggable={draggableIndex === index}
      onmousedown={(e) => handleMouseDown(e, index)}
      onmouseup={handleMouseUp}
      ondragstart={(e) => handleDragStart(e, index)}
      ondragover={(e) => handleDragOver(e, index)}
      ondragleave={handleDragLeave}
      ondragend={handleDragEnd}
      class="sortable-item {getDropClass(index)}"
      class:dragging={draggedIndex === index}
      role="listitem"
      aria-grabbed={draggedIndex === index}
    >
      {@render children(item)}
    </div>
  {/each}
</div>

<style>
  .sortable-list {
    position: relative;
  }

  .sortable-item {
    position: relative;
    transition:
      transform 0.15s ease,
      opacity 0.15s ease;
  }

  .sortable-item.dragging {
    opacity: 0.4;
  }

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
    top: -3px;
  }

  .sortable-item.drop-after::after {
    bottom: -3px;
  }

  .sortable-item.drop-before {
    transform: translateY(2px);
  }

  .sortable-item.drop-after {
    transform: translateY(-2px);
  }

  :global([data-drag-handle]) {
    cursor: grab;
    touch-action: none;
  }

  :global([data-drag-handle]:active) {
    cursor: grabbing;
  }
</style>
