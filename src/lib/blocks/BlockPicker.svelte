<script lang="ts">
  import { blockRegistry } from '$lib/blocks';

  let {
    onselect,
    onclose
  }: {
    onselect: (type: string) => void;
    onclose: () => void;
  } = $props();

  let dialogEl: HTMLDialogElement;

  export function open() {
    dialogEl?.showModal();
  }

  function handleSelect(type: string) {
    onselect(type);
    dialogEl?.close();
  }

  function handleClose() {
    onclose();
  }

  const blockTypes = Object.values(blockRegistry);
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  onclose={handleClose}
>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Add Block</h2>
      <button
        onclick={() => dialogEl?.close()}
        class="text-gray-400 hover:text-white"
        aria-label="Close"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div class="space-y-2">
      {#each blockTypes as def}
        <button
          onclick={() => handleSelect(def.type)}
          class="flex w-full cursor-pointer items-center gap-3 rounded-lg bg-gray-800/50 px-4 py-3 text-left transition-colors hover:bg-gray-800"
        >
          <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={def.icon} />
          </svg>
          <div>
            <span class="text-sm font-medium text-white">{def.name}</span>
          </div>
        </button>
      {/each}
    </div>
  </div>
</dialog>
