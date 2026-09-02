<script lang="ts">
  import { ProductGrid } from '$lib/components/shop';
  import BlockHeading from '../BlockHeading.svelte';
  import type {
    Block,
    ProductsBlockConfig,
    ProductWithTags,
    PublicSettings
  } from '$lib/server/schema';

  /**
   * A few things for sale, on whatever page you put it.
   *
   * It draws the shop's products rather than owning a list of its own — the
   * same reason the shows block doesn't own a tour. Adding a shirt to the shop
   * puts it here; there's no second place to keep it up to date.
   */
  let {
    block,
    products = [],
    settings,
    locale = 'nb-NO'
  }: {
    block: Block;
    products?: ProductWithTags[];
    settings?: PublicSettings | null;
    locale?: string;
  } = $props();

  const config = $derived((block.config as ProductsBlockConfig) ?? {});

  const shown = $derived.by(() => {
    let list = products;
    // By slug, so renaming a tag doesn't quietly empty the block.
    if (config.tag) list = list.filter((p) => p.tags.some((t) => t.slug === config.tag));
    return config.limit != null ? list.slice(0, config.limit) : list;
  });

  /** Three unless the block says otherwise. The grid caps phones at two. */
  const columns = $derived(config.columns ?? 3);
</script>

<!--
  Hiding the type in the picker only stops new ones being added; a block already
  on a page would go on offering things to buy after the shop was switched off,
  with a basket that leads to a 404.
-->
{#if settings?.shopEnabled && shown.length > 0}
  <!-- A plain section, like the other blocks. A flex gap here stacked on top of
       the heading's own margin, so this one sat further from its contents than
       everything above it. -->
  <section>
    <BlockHeading heading={config.heading} />

    <ProductGrid products={shown} {locale} showPrice={config.showPrice !== false} {columns} />
  </section>
{/if}
