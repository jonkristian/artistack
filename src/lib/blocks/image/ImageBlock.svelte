<script lang="ts">
  import type { Block, Media, ImageBlockConfig } from '$lib/server/schema';
  import { shapeClasses, shapeAspects } from '$lib/blocks/utils';

  let {
    block,
    media
  }: {
    block: Block;
    media: Media[];
  } = $props();

  const config = $derived((block.config as ImageBlockConfig) ?? {});
  const alignment = $derived(config.alignment ?? 'center');
  const shape = $derived(config.shape ?? 'rounded');
  const size = $derived(config.size ?? 'medium');
  const showGlow = $derived(config.showGlow ?? false);

  const alignmentClass = $derived(
    {
      left: 'justify-start',
      center: 'justify-center',
      right: 'justify-end'
    }[alignment]
  );

  /*
   * Width only. Height used to be pinned to match — every size was a square
   * box — so a portrait or landscape crop was cropped a second time by
   * object-cover on the way in. The proportions come from the shape instead.
   */
  const sizeClass = $derived(
    {
      mini: 'w-16',
      small: 'w-24',
      medium: 'w-40',
      large: 'w-56',
      full: 'w-full'
    }[size]
  );

  const shapeClass = $derived(shapeClasses[shape] ?? 'rounded-2xl');
  const aspectClass = $derived(shapeAspects[shape] ?? 'aspect-square');
  const isFullWidth = $derived(size === 'full');
</script>

{#if config.imageUrl}
  <section class={isFullWidth ? '-mx-2 sm:-mx-6' : ''}>
    <div class="flex {alignmentClass}">
      <div class="relative {sizeClass} {aspectClass}">
        {#if showGlow}
          <div
            class="absolute -inset-4 blur-2xl {shape === 'circle' ? 'rounded-full' : ''}"
            style="background: var(--color-accent); opacity: 0.25"
          ></div>
        {/if}
        <!-- Full width runs edge to edge, so it keeps its corners square and
             loses the shadow — but it still uses the shape's proportions
             rather than a hardcoded 16/9. -->
        <img
          src={config.imageUrl}
          alt=""
          class="relative h-full w-full {isFullWidth ? '' : shapeClass} object-cover {isFullWidth
            ? ''
            : 'shadow-lg'}"
        />
      </div>
    </div>
  </section>
{/if}
