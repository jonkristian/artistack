<script lang="ts">
  import '../app.css';
  import { TrackingPixels } from '$lib/components/ui';
  import type { LayoutData } from './$types';

  let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

  const pixels = $derived(data.pixels);
</script>

<svelte:head>
  <title>Artistack</title>
  <meta name="description" content="Artist link hub" />
</svelte:head>

<!-- Every public page, so a conversion is attributed wherever someone lands.
     Renders nothing at all unless pixels are switched on and an id is set. -->
{#if pixels}
  <TrackingPixels metaPixelId={pixels.metaPixelId} tiktokPixelId={pixels.tiktokPixelId} />
{/if}

{@render children()}
