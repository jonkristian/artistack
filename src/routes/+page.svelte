<script lang="ts">
  import type { PageData } from './$types';
  import { resolveTheme } from '$lib/themes';
  import SiteBackground from '$lib/pages/SiteBackground.svelte';
  import * as cart from '$lib/stores/cart.svelte';

  let { data }: { data: PageData } = $props();

  const profile = $derived(data.profile);
  const settings = $derived(data.settings);
  const links = $derived(data.links);
  const shows = $derived(data.shows);
  const blocks = $derived(data.blocks ?? []);
  const media = $derived(data.media ?? []);
  const products = $derived(data.products ?? []);

  // Seeded here rather than in the block, so a page carrying two shop blocks
  // still has one basket between them.
  $effect(() => cart.seed(data.cart));

  // SEO
  const pageTitle = $derived(settings?.siteTitle || profile?.name || 'Artist');
  const pageDescription = $derived(
    profile?.bio ?? `Check out ${profile?.name ?? 'this artist'} - links, music, and more.`
  );

  const Layout = $derived(resolveTheme(settings?.layout));
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={pageDescription} />
  {@html `<style>html, body { background-color: ${settings?.colorBg ?? '#0c0a14'}; }</style>`}
</svelte:head>

<!-- The grain, the colours and the text colour, shared with every other
     public page rather than restated here. -->
<SiteBackground {settings}>
  {#if profile}
    <Layout {profile} {settings} {links} {shows} {blocks} {media} {products} />
  {:else}
    <!-- Empty State -->
    <main
      class="flex min-h-screen items-center justify-center px-4"
      style="background-color: var(--color-bg)"
    >
      <div class="text-center">
        <img src="/assets/logo.svg" alt="Artistack" class="mx-auto mb-8 h-10" />
        <h1 class="mb-3 text-2xl font-bold" style="color: var(--color-text)">Welcome</h1>
        <p class="mb-8" style="color: var(--color-text-muted)">This site hasn't been set up yet.</p>
        <a
          href="/login"
          class="inline-block rounded-lg px-6 py-3 font-medium transition-opacity hover:opacity-80"
          style="background-color: var(--color-accent); color: white"
        >
          Get Started
        </a>
      </div>
    </main>
  {/if}
</SiteBackground>
