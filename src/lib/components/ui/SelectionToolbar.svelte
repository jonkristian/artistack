<script lang="ts">
  /**
   * Select all / Delete / Clear for a grid with a `Selection`.
   *
   * Delete and Clear appear only once something is selected — an always-present
   * "Delete (0)" is dead weight, and a live count is the confirmation that the
   * selection is what you think it is.
   */
  let {
    count,
    allSelected,
    onToggleAll,
    onDelete,
    onClear
  }: {
    count: number;
    allSelected: boolean;
    onToggleAll: () => void;
    onDelete: () => void;
    onClear: () => void;
  } = $props();
</script>

<div class="flex items-center gap-2">
  <button
    onclick={onToggleAll}
    class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
  >
    {allSelected ? 'Deselect all' : 'Select all'}
  </button>
  {#if count > 0}
    <button
      onclick={onDelete}
      class="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
      Delete ({count})
    </button>
    <button
      onclick={onClear}
      class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
    >
      Clear
    </button>
  {/if}
</div>
