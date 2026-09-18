<script lang="ts">
  import '../app.css';
  import { TrackingPixels } from '$lib/components/ui';
  import { ShopOverlay } from '$lib/components/shop';
  import { readableOn } from '$lib/utils/color';
  import { isTrackedPath } from '$lib/utils/tracked-paths';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import type { LayoutData } from './$types';

  let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

  const pixels = $derived(data.pixels);

  /*
   * A page reached without a page load, reported so it's counted. The first
   * page of a visit was counted by the server as it rendered, and a change of
   * query or hash on the same page isn't a new view.
   */
  afterNavigate(({ type, from, to }) => {
    if (type === 'enter' || !to || to.url.pathname === from?.url.pathname) return;
    if (!isTrackedPath(to.url.pathname)) return;
    const body = new Blob([JSON.stringify({ path: to.url.pathname })], {
      type: 'application/json'
    });
    navigator.sendBeacon('/api/track/view', body);
  });

  /** Defaults here so every page gets a complete palette, set up or not. */
  const settings = $derived({
    colorBg: data.settings?.colorBg ?? '#0c0a14',
    colorCard: data.settings?.colorCard ?? '#14101f',
    colorAccent: data.settings?.colorAccent ?? '#8b5cf6',
    colorText: data.settings?.colorText ?? '#f4f4f5',
    colorTextMuted: data.settings?.colorTextMuted ?? '#a1a1aa',
    colorIcon: data.settings?.colorIcon ?? '#a1a1aa'
  });
</script>

<svelte:head>
  <!-- No description here: every public page writes its own, and a second
       one ahead of it is the one link previews read. -->
  <title>Artistack</title>
</svelte:head>

<!-- Every public page, so a conversion is attributed wherever someone lands —
     and only those, not the admin, sign-in or previews. Not for anyone signed
     in either: an ad platform counting them builds its audiences from the band.
     Renders nothing at all unless pixels are switched on and an id is set. -->
{#if pixels && !data.user && isTrackedPath(page.url.pathname)}
  <TrackingPixels metaPixelId={pixels.metaPixelId} tiktokPixelId={pixels.tiktokPixelId} />
{/if}

<!--
  The site's colours, declared once for everything under them.

  They used to be set on a wrapper inside the page, which meant anything the
  layout drew alongside the page — the basket panel — asked for variables that
  weren't in scope and got nothing. An undefined custom property makes the whole
  declaration invalid, so the panel came out transparent with default text.

  The derived tokens exist because a theme's card colour is not guaranteed to
  contrast with its background. On this site card is #130d1c and background is
  #150e1a: painting a panel in one on top of the other makes it invisible. A
  raised surface has to be derived from the text colour, which contrasts with
  the page by definition, rather than assumed.

  `--color-on-accent` is black or white depending on how light the accent is.
  Buttons had white nailed on, which reads on a violet and disappears on a
  yellow — and the accent is something anyone can change in Appearance.
-->
<div
  style="
		--color-bg: {settings.colorBg};
		--color-card: {settings.colorCard};
		--color-accent: {settings.colorAccent};
		--color-text: {settings.colorText};
		--color-text-muted: {settings.colorTextMuted};
		--color-icon: {settings.colorIcon};
		--color-surface: color-mix(in srgb, {settings.colorCard} 86%, {settings.colorText} 14%);
		--color-line: color-mix(in srgb, {settings.colorTextMuted} 28%, transparent);
		--color-well: color-mix(in srgb, {settings.colorTextMuted} 16%, transparent);
		--color-on-accent: {readableOn(settings.colorAccent)};
		--color-accent-deep: color-mix(in srgb, {settings.colorAccent} 38%, {settings.colorBg});
	"
>
  {@render children()}

  <!-- The basket floats over every page, so buying something never means
       leaving the one you were reading. Draws nothing unless the shop is on and
       there is something in it. -->
  <ShopOverlay
    cart={data.cart}
    enabled={data.settings?.shopEnabled ?? false}
    locale={data.settings?.locale ?? 'nb-NO'}
  />
</div>
