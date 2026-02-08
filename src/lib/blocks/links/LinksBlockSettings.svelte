<script lang="ts">
  import type { Block, LinksBlockConfig } from '$lib/server/schema';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as LinksBlockConfig) ?? {});
  const displayAs = $derived(config.displayAs ?? 'rows');
  const gridColumns = $derived(config.gridColumns ?? 3);
  const stackOnMobile = $derived(config.stackOnMobile !== false);

  function updateHeading(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (value === (config.heading ?? '')) return;
    block.config = { ...config, heading: value || undefined };
  }

  function setDisplayAs(mode: 'rows' | 'grid') {
    block.config = { ...config, displayAs: mode };
  }

  function setGridColumns(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    block.config = { ...config, gridColumns: value };
  }
</script>

<div class="space-y-4">
  <div>
    <label for="links-heading-{block.id}" class="mb-1 block text-sm text-gray-400"
      >Section Heading</label
    >
    <input
      id="links-heading-{block.id}"
      type="text"
      value={config.heading ?? ''}
      onblur={updateHeading}
      placeholder="e.g., Listen, Follow"
      class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
    />
  </div>

  <div>
    <span class="mb-2 block text-sm text-gray-400">Display as</span>
    <div class="grid grid-cols-2 gap-2">
      {#each [{ value: 'rows', label: 'Rows' }, { value: 'grid', label: 'Grid' }] as option}
        <button
          onclick={() => setDisplayAs(option.value as 'rows' | 'grid')}
          class="rounded-lg px-3 py-2 text-sm transition-colors {displayAs === option.value
            ? 'bg-violet-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  {#if displayAs === 'grid'}
    <div>
      <label for="links-columns-{block.id}" class="mb-1 block text-sm text-gray-400"
        >Columns: {gridColumns}</label
      >
      <input
        id="links-columns-{block.id}"
        type="range"
        min="2"
        max="6"
        value={gridColumns}
        oninput={setGridColumns}
        class="w-full accent-violet-600"
      />
      <div class="mt-1 flex justify-between text-xs text-gray-500">
        <span>2</span>
        <span>6</span>
      </div>
    </div>

    <label class="flex cursor-pointer items-center justify-between">
      <span class="text-sm text-gray-400">Stack on mobile</span>
      <button
        type="button"
        role="switch"
        aria-checked={stackOnMobile}
        aria-label="Stack on mobile"
        onclick={() => (block.config = { ...config, stackOnMobile: !stackOnMobile })}
        class="relative h-6 w-11 rounded-full transition-colors {stackOnMobile
          ? 'bg-violet-600'
          : 'bg-gray-700'}"
      >
        <span
          class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {stackOnMobile
            ? 'translate-x-5'
            : ''}"
        ></span>
      </button>
    </label>
  {/if}
</div>
