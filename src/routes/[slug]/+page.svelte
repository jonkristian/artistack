<script lang="ts">
  import type { PageData } from './$types';
  import ReleasePage from '$lib/pages/ReleasePage.svelte';
  import CustomPage from '$lib/pages/CustomPage.svelte';
  import ShowPage from '$lib/pages/ShowPage.svelte';
  import ShopPage from '$lib/pages/ShopPage.svelte';

  let { data }: { data: PageData } = $props();

  const page = $derived(data.page);
  const settings = $derived(data.settings);
  const profile = $derived(data.profile);

  // A release is titled by the work; anything else by the page itself.
  const release = $derived(data.release);
  const heading = $derived(release ? release.title : page.title);

  const pageTitle = $derived(profile?.name ? `${profile.name} — ${heading}` : heading);

  const pageDescription = $derived(
    page.description ??
      (release
        ? data.isOut
          ? `Listen to ${release.title} by ${profile?.name ?? 'this artist'}.`
          : `${release.title} by ${profile?.name ?? 'this artist'} — out soon.`
        : `${page.title} — ${profile?.name ?? 'this artist'}.`)
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
  <link rel="canonical" href={data.canonical} />

  <meta property="og:type" content={page.type === 'release' ? 'music.song' : 'website'} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:url" content={data.canonical} />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={pageDescription} />

  {#if data.shareImage}
    <!-- Scrapers cache this hard and only re-scrape on request, so the URL
         behind it must stay stable once a link is in circulation.

         No width/height: this is usually the cover art, whose dimensions we
         don't know here, and declaring the wrong ones is worse than declaring
         none — scrapers measure the file themselves. -->
    <meta property="og:image" content={data.shareImage} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={data.shareImage} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}

  {@html `<style>html, body { background-color: ${settings?.colorBg ?? '#0c0a14'}; }</style>`}
</svelte:head>

{#if release}
  <ReleasePage
    {release}
    releaseLinks={data.releaseLinks ?? []}
    cover={release.coverUrl}
    isOut={data.isOut ?? false}
    published={page.published ?? false}
    {settings}
    {profile}
    artist={profile?.name ?? ''}
    emailCapture={settings?.subscribersEnabled ?? false}
    source={page.slug}
    preferredPlatform={data.preferredPlatform}
  />
{:else if data.show}
  <ShowPage
    show={data.show}
    lineup={data.lineup ?? []}
    imageShape={data.imageShape}
    {settings}
    {profile}
    media={data.media ?? []}
    locale={settings?.locale ?? 'nb-NO'}
  />
{:else if data.products}
  <ShopPage
    products={data.products ?? []}
    {settings}
    {profile}
    locale={settings?.locale ?? 'nb-NO'}
  />
{:else if data.blocks}
  <CustomPage
    {profile}
    {settings}
    blocks={data.blocks}
    links={data.links ?? []}
    shows={data.shows ?? []}
    media={data.media ?? []}
    products={data.products ?? []}
    releases={data.releases ?? []}
  />
{/if}
