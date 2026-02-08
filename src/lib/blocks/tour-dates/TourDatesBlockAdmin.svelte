<script lang="ts">
  import type { Block, TourDate } from '$lib/server/schema';
  import { toast } from '$lib/stores/toast.svelte';

  let {
    block,
    tourDates,
    onedittourdate,
    onaddtourdate
  }: {
    block: Block;
    tourDates: TourDate[];
    onedittourdate: (tourDate: TourDate) => void;
    onaddtourdate: (blockId: number) => void;
  } = $props();

  // Tour dates belonging to this block
  const blockTourDates = $derived(
    tourDates
      .filter((t) => t.blockId === block.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  );

  function handleDeleteTourDate(id: number) {
    const index = tourDates.findIndex((t) => t.id === id);
    if (index !== -1) {
      tourDates.splice(index, 1);
      tourDates.length = tourDates.length; // trigger reactivity
      toast.info('Tour date deleted');
    }
  }
</script>

{#if blockTourDates.length > 0}
  <div class="space-y-2">
    <div class="flex justify-end">
      <button
        onclick={() => onaddtourdate(block.id)}
        class="text-sm text-gray-400 hover:text-white"
      >
        + Add
      </button>
    </div>

    {#each blockTourDates as t (t.id)}
      <div
        class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800"
      >
        <div class="text-sm">
          <span class="text-gray-400">{t.date}</span>
          <span class="mx-2 text-gray-600">-</span>
          <span class="text-white">{t.venue.name}</span>
          <span class="text-gray-500">, {t.venue.city}</span>
          {#if t.soldOut}
            <span class="ml-2 text-xs text-red-400">Sold out</span>
          {/if}
        </div>
        <div class="flex items-center gap-1">
          <button
            onclick={() => onedittourdate(t)}
            class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-white"
            aria-label="Edit tour date"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onclick={() => handleDeleteTourDate(t.id)}
            class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-700 hover:text-red-400"
            aria-label="Delete tour date"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <button
    type="button"
    onclick={() => onaddtourdate(block.id)}
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
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
    <span class="text-sm text-gray-400">Add tour date</span>
  </button>
{/if}
