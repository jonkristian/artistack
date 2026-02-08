<script lang="ts">
  import type { Block, GalleryBlockConfig } from '$lib/server/schema';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as GalleryBlockConfig) ?? {});
  const displayAs = $derived(config.displayAs ?? 'grid');

  function setDisplayAs(mode: 'grid' | 'carousel' | 'bento') {
    block.config = { ...config, displayAs: mode };
  }

  function updateHeading(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (value === (config.heading ?? '')) return;
    block.config = { ...config, heading: value || undefined };
  }
</script>

<div class="space-y-4">
  <div>
    <label for="images-heading-{block.id}" class="mb-1 block text-sm text-gray-400"
      >Section Heading</label
    >
    <input
      id="images-heading-{block.id}"
      type="text"
      value={config.heading ?? ''}
      onblur={updateHeading}
      placeholder="e.g., Gallery"
      class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
    />
  </div>

  <div>
    <span class="mb-2 block text-sm text-gray-400">Display as</span>
    <div class="grid grid-cols-3 gap-2">
      {#each [{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carousel' }, { value: 'bento', label: 'Bento' }] as option}
        <button
          onclick={() => setDisplayAs(option.value as 'grid' | 'carousel' | 'bento')}
          class="rounded-lg px-3 py-2 text-sm transition-colors {displayAs === option.value
            ? 'bg-violet-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>
</div>
