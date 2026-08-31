<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The site's colours and the grain over the top of them.
   *
   * Shared by the artist page and any ordinary page so the two can't drift:
   * these are the variables every block reads, and a page rendering without
   * them falls back to whatever the browser defaults to.
   *
   * It sets `color` as well as declaring the variables. Declaring them alone
   * left text at the browser's default — black on a dark page — for anything
   * that didn't colour itself explicitly.
   */
  let {
    settings,
    children
  }: {
    settings: {
      colorBg?: string | null;
      colorCard?: string | null;
      colorAccent?: string | null;
      colorText?: string | null;
      colorTextMuted?: string | null;
      colorIcon?: string | null;
    } | null;
    children: Snippet;
  } = $props();
</script>

<div
  class="pointer-events-none fixed inset-0 z-50 opacity-[0.04]"
  style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 512 512%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
></div>
<div
  style="
		--color-bg: {settings?.colorBg ?? '#0c0a14'};
		--color-card: {settings?.colorCard ?? '#14101f'};
		--color-accent: {settings?.colorAccent ?? '#8b5cf6'};
		--color-text: {settings?.colorText ?? '#f4f4f5'};
		--color-text-muted: {settings?.colorTextMuted ?? '#a1a1aa'};
		--color-icon: {settings?.colorIcon ?? '#a1a1aa'};
		color: var(--color-text);
	"
>
  {@render children()}
</div>
