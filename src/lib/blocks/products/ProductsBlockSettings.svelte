<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import type { Block, ProductWithTags, ProductsBlockConfig } from '$lib/server/schema';

  let { block, products = [] }: { block: Block; products?: ProductWithTags[] } = $props();

  const config = $derived((block.config as ProductsBlockConfig) ?? {});

  /*
   * Only tags something is actually filed under — the shop's own, not the whole
   * site's vocabulary. Offering a tag that only clips use would let you filter
   * on one no product has, and the block would render empty with nothing to say
   * why.
   */
  const tagOptions = $derived(
    [...new Map(products.flatMap((p) => p.tags).map((t) => [t.slug, t])).values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  );

  function updateHeading(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (value === (config.heading ?? '')) return;
    block.config = { ...config, heading: value || undefined };
  }

  function updateTag(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    block.config = { ...config, tag: value || undefined };
  }

  function updateLimit(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    block.config = { ...config, limit: value ? Number(value) : undefined };
  }

  function updateColumns(columns: 2 | 3 | 4) {
    block.config = { ...config, columns };
  }

  function togglePrice(e: Event) {
    block.config = { ...config, showPrice: (e.target as HTMLInputElement).checked };
  }
</script>

<div class="space-y-3">
  <div>
    <label for="products-heading-{block.id}" class={labelClass}>Section Heading</label>
    <input
      id="products-heading-{block.id}"
      type="text"
      value={config.heading ?? ''}
      onblur={updateHeading}
      placeholder="e.g., Merch, Records"
      class={fieldClass}
    />
  </div>

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
    <p class="mt-2 text-xs text-gray-500">Phones always show two — more than that is unreadable.</p>
  </div>

  <div>
    <label for="products-limit-{block.id}" class={labelClass}>How many</label>
    <select
      id="products-limit-{block.id}"
      value={config.limit ?? ''}
      onchange={updateLimit}
      class={fieldClass}
    >
      <option value="">All of them</option>
      {#each [2, 4, 6, 8] as count (count)}
        <option value={count}>{count}</option>
      {/each}
    </select>
  </div>

  {#if tagOptions.length > 0}
    <div>
      <label for="products-tag-{block.id}" class={labelClass}>Tag</label>
      <!-- Only tags a product actually carries. Filtering on one nothing uses
           would render an empty block with no way to tell why. -->
      <select
        id="products-tag-{block.id}"
        value={config.tag ?? ''}
        onchange={updateTag}
        class={fieldClass}
      >
        <option value="">Everything</option>
        {#each tagOptions as tag (tag.slug)}
          <option value={tag.slug}>{tag.name}</option>
        {/each}
      </select>
      <p class="mt-2 text-xs text-gray-500">Tag a product on the product itself.</p>
    </div>
  {/if}

  <label
    class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5"
  >
    <span class="text-sm text-white">Show Prices</span>
    <input
      type="checkbox"
      checked={config.showPrice !== false}
      onchange={togglePrice}
      class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
    />
  </label>
</div>
