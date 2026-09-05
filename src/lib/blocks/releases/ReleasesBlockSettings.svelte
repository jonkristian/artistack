<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import type { Block, ReleasesBlockConfig } from '$lib/server/schema';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as ReleasesBlockConfig) ?? {});

  function updateHeading(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (value === (config.heading ?? '')) return;
    block.config = { ...config, heading: value || undefined };
  }

  function updateDisplay(displayAs: 'grid' | 'rows') {
    block.config = { ...config, displayAs };
  }

  function updateColumns(columns: 2 | 3 | 4) {
    block.config = { ...config, columns };
  }

  function updateLimit(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    block.config = { ...config, limit: value ? Number(value) : undefined };
  }

  function updateFilter(filter: 'all' | 'out' | 'upcoming') {
    block.config = { ...config, filter };
  }

  function togglePresave(e: Event) {
    block.config = { ...config, showPresave: (e.target as HTMLInputElement).checked };
  }

  function toggleServices(e: Event) {
    block.config = { ...config, showServices: (e.target as HTMLInputElement).checked };
  }
</script>

<div class="space-y-3">
  <div>
    <label for="releases-heading-{block.id}" class={labelClass}>Section Heading</label>
    <input
      id="releases-heading-{block.id}"
      type="text"
      value={config.heading ?? ''}
      onblur={updateHeading}
      placeholder="e.g., Music, Records"
      class={fieldClass}
    />
  </div>

  <div>
    <span class={labelClass}>Show</span>
    <div class="flex gap-2">
      {#each [{ key: 'all', label: 'All' }, { key: 'out', label: 'Out' }, { key: 'upcoming', label: 'Upcoming' }] as option (option.key)}
        <button
          type="button"
          onclick={() => updateFilter(option.key as 'all' | 'out' | 'upcoming')}
          class="rounded-lg border px-4 py-2 text-sm transition-colors {(config.filter ?? 'all') ===
          option.key
            ? 'border-violet-500 bg-violet-600/20 text-white'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
    <p class="mt-2 text-xs text-gray-500">
      {#if (config.filter ?? 'all') === 'upcoming'}
        What's next, soonest first — so a pre-save page is found before the day.
      {:else if config.filter === 'out'}
        Only records that can actually be played.
      {:else}
        Everything, newest first, upcoming records included.
      {/if}
    </p>
  </div>

  <div>
    <span class={labelClass}>Layout</span>
    <div class="flex gap-2">
      {#each [{ key: 'grid', label: 'Grid' }, { key: 'rows', label: 'Rows' }] as option (option.key)}
        <button
          type="button"
          onclick={() => updateDisplay(option.key as 'grid' | 'rows')}
          class="rounded-lg border px-4 py-2 text-sm transition-colors {(config.displayAs ??
            'grid') === option.key
            ? 'border-violet-500 bg-violet-600/20 text-white'
            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}"
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Only for the grid. A row is a row however many you'd have put across. -->
  {#if (config.displayAs ?? 'grid') === 'grid'}
    <div>
      <span class={labelClass}>Per row</span>
      <div class="flex gap-2">
        {#each [2, 3, 4] as option (option)}
          <button
            type="button"
            onclick={() => updateColumns(option as 2 | 3 | 4)}
            class="rounded-lg border px-4 py-2 text-sm transition-colors {(config.columns ?? 3) ===
            option
              ? 'border-violet-500 bg-violet-600/20 text-white'
              : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}"
          >
            {option}
          </button>
        {/each}
      </div>
      <p class="mt-2 text-xs text-gray-500">Phones always show two — sleeves get small fast.</p>
    </div>
  {/if}

  <div>
    <label for="releases-limit-{block.id}" class={labelClass}>How many</label>
    <select
      id="releases-limit-{block.id}"
      value={config.limit ?? ''}
      onchange={updateLimit}
      class={fieldClass}
    >
      <option value="">All of them</option>
      {#each [1, 2, 3, 4, 6, 8] as count (count)}
        <option value={count}>{count}</option>
      {/each}
    </select>
  </div>

  <!-- Rows only, where there's room beside the title for them. -->
  {#if config.displayAs === 'rows'}
    <label
      class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5"
    >
      <span class="text-sm text-white">Service Buttons</span>
      <input
        type="checkbox"
        checked={config.showServices !== false}
        onchange={toggleServices}
        class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
      />
    </label>
    <p class="text-xs text-gray-500">
      Spotify, Apple Music and whatever else the release lists, straight from the row. Add them on
      the release itself.
    </p>
  {/if}

  <!-- Not while the block is showing records that are already out: there'd be
       nothing for it to turn on or off. -->
  {#if config.filter !== 'out'}
    <label
      class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5"
    >
      <span class="text-sm text-white">Pre-save Button</span>
      <input
        type="checkbox"
        checked={config.showPresave !== false}
        onchange={togglePresave}
        class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
      />
    </label>
    <p class="text-xs text-gray-500">
      Shown on records that aren't out yet, and only once the release has a pre-save link of its
      own.
    </p>
  {/if}
</div>
