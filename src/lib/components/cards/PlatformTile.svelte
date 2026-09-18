<script lang="ts">
  import { platformIcons, platformColors } from '$lib/utils/platforms';

  /**
   * A service's mark on a tile tinted with its brand colour, the way the front
   * page's link rows draw it. The mark itself takes the site's icon colour, so
   * a row of services reads as the site's rather than as a row of logos.
   */
  let { platform }: { platform: string } = $props();

  const icon = $derived(platformIcons[platform] ?? null);
  // color-mix rather than a hex alpha suffix, which only works on a six-digit
  // hex and silently drew nothing for a var() fallback.
  const tint = $derived(platformColors[platform] ?? 'var(--color-icon)');
</script>

<!-- A faint light base under the tint, so a service whose brand is black (TIDAL)
     still has a tile rather than a hole in a dark page. -->
<div
  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] font-bold"
  style="background-image: linear-gradient(135deg, color-mix(in srgb, {tint} 25%, transparent), color-mix(in srgb, {tint} 12%, transparent)); color: var(--color-icon)"
  aria-hidden="true"
>
  {#if icon}
    <svg viewBox="0 0 24 24" class="h-6 w-6" style="fill: var(--color-icon)">
      <path d={icon} />
    </svg>
  {:else}
    {platform.charAt(0).toUpperCase()}
  {/if}
</div>
