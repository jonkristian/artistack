<script lang="ts">
  import type { Block, Media, ImageBlockConfig } from '$lib/server/schema';
  import { MediaPicker } from '$lib/components/ui';
  import type { Shape } from '$lib/components/dialogs';

  let {
    block,
    media
  }: {
    block: Block;
    media: Media[];
  } = $props();

  const config = $derived((block.config as ImageBlockConfig) ?? {});
  const currentShape = $derived(config.shape ?? 'rounded');

  function handleSelect(url: string | null, shape?: Shape) {
    // Only accept the shapes that ImageBlockConfig supports
    const validShape =
      shape && ['circle', 'rounded', 'square'].includes(shape)
        ? (shape as 'circle' | 'rounded' | 'square')
        : currentShape;
    block.config = {
      ...config,
      imageUrl: url ?? undefined,
      shape: validShape
    };
  }
</script>

<div class="space-y-4">
  <MediaPicker
    value={config.imageUrl ?? null}
    label="Image"
    {media}
    aspectRatio="1/1"
    shapes={['circle', 'rounded', 'square']}
    defaultShape={currentShape}
    onselect={handleSelect}
  />
</div>
