<script lang="ts">
  import type { Block, Media, ImageBlockConfig } from '$lib/server/schema';
  import { shapeClasses } from '$lib/blocks/utils';

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

  const sizeClass = $derived(
    {
      mini: 'h-16 w-16',
      small: 'h-24 w-24',
      medium: 'h-40 w-40',
      large: 'h-56 w-56',
      full: 'w-full max-w-md'
    }[size]
  );

  const shapeClass = $derived(shapeClasses[shape] || 'rounded-2xl');
  const isFullWidth = $derived(size === 'full');
</script>

{#if config.imageUrl}
  <section class="mb-8">
    <div class="flex {alignmentClass}">
      <div class="relative {sizeClass}">
        {#if showGlow}
          <div
            class="absolute -inset-4 blur-2xl {shape === 'circle' ? 'rounded-full' : ''}"
            style="background: var(--color-accent); opacity: 0.25"
          ></div>
        {/if}
        <img
          src={config.imageUrl}
          alt=""
          class="relative h-full w-full {shapeClass} object-cover shadow-lg"
          style={isFullWidth ? 'aspect-ratio: 16/9' : ''}
        />
      </div>
    </div>
  </section>
{/if}
