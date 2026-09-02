<script lang="ts">
  import { formatPrice } from '$lib/utils/price';
  import type {
    Block,
    ProductWithTags,
    ProductsBlockConfig,
    PublicSettings
  } from '$lib/server/schema';

  /**
   * A window onto the shop, not an editor for it.
   *
   * Products belong to the shop, so editing one from inside a block would mean
   * the same shirt could be priced from two blocks on two pages, each looking
   * like its own list.
   */
  let {
    block,
    products = [],
    settings
  }: {
    block: Block;
    products?: ProductWithTags[];
    settings?: PublicSettings | null;
  } = $props();

  const config = $derived((block.config as ProductsBlockConfig) ?? {});
  const locale = $derived(settings?.locale || 'nb-NO');

  const matching = $derived(
    config.tag ? products.filter((p) => p.tags.some((t) => t.slug === config.tag)) : products
  );
  const shown = $derived(config.limit != null ? matching.slice(0, config.limit) : matching);
</script>

<div class="space-y-3">
  {#if matching.length > 0}
    <ul class="space-y-1.5">
      {#each shown as product (product.id)}
        <li class="flex items-baseline justify-between gap-3 text-sm">
          <span class="truncate text-gray-300">
            {product.name}{#if !product.visible}<span class="text-gray-500"> · hidden</span>{/if}
          </span>
          <span class="shrink-0 text-xs text-gray-500">
            {formatPrice(product.price, product.currency, locale)}
          </span>
        </li>
      {/each}
    </ul>

    {#if config.limit != null && matching.length > shown.length}
      <p class="text-xs text-gray-500">Showing {shown.length} of {matching.length}</p>
    {/if}
  {:else}
    <p class="text-sm text-gray-500">Nothing in the shop yet.</p>
  {/if}

  <a href="/admin/shop" class="inline-block text-sm text-gray-400 hover:text-white">
    Edit the shop →
  </a>
</div>
