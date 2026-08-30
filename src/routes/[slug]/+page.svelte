<script lang="ts">
  import type { PageData } from './$types';
  import ReleasePage from '$lib/pages/ReleasePage.svelte';

  let { data }: { data: PageData } = $props();

  const page = $derived(data.page);
  const settings = $derived(data.settings);
  const profile = $derived(data.profile);

  // A release is titled by the work; anything else by the page itself.
  const heading = $derived('release' in data ? data.release.title : page.title);

  const pageTitle = $derived(profile?.name ? `${profile.name} — ${heading}` : heading);

  const pageDescription = $derived(
    page.description ??
      ('release' in data
        ? data.isOut
          ? `Listen to ${data.release.title} by ${profile?.name ?? 'this artist'}.`
          : `${data.release.title} by ${profile?.name ?? 'this artist'} — out soon.`
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

{#if 'release' in data}
  <ReleasePage
    release={data.release}
    releaseLinks={data.releaseLinks}
    cover={data.release.coverUrl}
    isOut={data.isOut}
    published={page.published ?? false}
    {settings}
    artist={profile?.name ?? ''}
    emailCapture={settings?.subscribersEnabled ?? false}
    source={page.slug}
    preferredPlatform={data.preferredPlatform}
  />
{/if}
