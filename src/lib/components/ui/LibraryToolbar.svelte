<script lang="ts">
  /**
   * The one row above a library grid: filter, bulk actions, and whatever
   * creates a new thing.
   *
   * Media, Clips and Releases all had this as two rows — a header holding only
   * the primary button, then a filter/selection row under it. Two rows for
   * three controls costs an act of vertical space on every one of these pages,
   * and on a phone it pushed the grid below the fold before a single tile had
   * been drawn.
   *
   * The filter and bulk actions hide when there's nothing to act on, but the
   * actions stay: an empty library is exactly when you want the button that
   * fills it.
   */
  import type { Snippet } from 'svelte';
  import FilterSelect, { type FilterOption } from './FilterSelect.svelte';
  import SelectionToolbar from './SelectionToolbar.svelte';

  let {
    options,
    selected = $bindable([]),
    total,
    onFilterChange,
    count,
    allSelected,
    onToggleAll,
    onDelete,
    onClear,
    actions
  }: {
    options: FilterOption[];
    selected?: string[];
    /** Everything in the library, before filtering — also whether it's empty. */
    total: number;
    onFilterChange?: () => void;
    count: number;
    allSelected: boolean;
    onToggleAll: () => void;
    onDelete: () => void;
    onClear: () => void;
    actions?: Snippet;
  } = $props();
</script>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  {#if total > 0}
    <div class="flex flex-wrap items-center gap-2">
      <FilterSelect {options} bind:selected {total} onchange={onFilterChange} />
      <SelectionToolbar {count} {allSelected} {onToggleAll} {onDelete} {onClear} />
    </div>
  {:else}
    <div></div>
  {/if}

  {#if actions}
    <div class="flex flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
