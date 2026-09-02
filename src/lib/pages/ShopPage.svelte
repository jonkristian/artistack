<script lang="ts">
  import SiteBackground from './SiteBackground.svelte';
  import { resolveTheme } from '$lib/themes';
  import { ProductGrid } from '$lib/components/shop';
  import type { PublicSettings } from '$lib/server/settings';
  import type { Product, Profile } from '$lib/server/schema';

  /**
   * Everything for sale, at its own address.
   *
   * Kept because a shop wants a URL you can put in a bio or on a poster, but
   * it's the same grid the block draws — the basket and the checkout live in
   * the panel over the top, not on this page.
   */
  let {
    products,
    settings,
    profile,
    locale = 'nb-NO'
  }: {
    products: Product[];
    settings: PublicSettings | null;
    profile: Profile;
    locale?: string;
  } = $props();

  const Layout = $derived(resolveTheme(settings?.layout));
</script>

<SiteBackground {settings}>
  <Layout {profile} {settings} links={[]} shows={[]} blocks={[]} media={[]}>
    {#if products.length === 0}
      <p class="py-10 text-center text-sm" style="color: var(--color-text-muted)">
        Nothing here just yet.
      </p>
    {:else}
      <ProductGrid {products} {locale} />
    {/if}
  </Layout>
</SiteBackground>
