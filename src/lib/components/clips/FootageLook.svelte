<script lang="ts">
  /**
   * The clip's look, drawn over the video element instead of into the file.
   *
   * A `<video>` takes a CSS filter like any other element, so the grade, the
   * curves, the softness and the channel split can all be shown live — which
   * means changing an effect, or dragging one along the strip, lands instantly
   * rather than costing a render. The same bargain the captions already have,
   * and the reason the quick render leaves all of this out.
   *
   * A likeness, not a copy. Grain is missing because a browser has no honest
   * way to make it, and an effect leaves it out rather than faking it badly.
   * The curves are the one part that is exact: `feComponentTransfer` with a
   * table interpolates between its control points, which is the same
   * piecewise-linear ramp ffmpeg's `curves` builds from the same numbers.
   *
   * Renders the filter definitions and hands back the `filter` value to put on
   * the video; it draws nothing itself, so it is placed anywhere convenient and
   * sized zero.
   */
  import type { PictureOverlay, PictureSvg } from '$lib/clips/effects';

  let {
    svg,
    overlay = [],
    id = 'footage-look'
  }: { svg: PictureSvg[]; overlay?: PictureOverlay[]; id?: string } = $props();

  /**
   * `objectBoundingBox`, so every offset and radius is a fraction of the video
   * rather than a pixel count.
   *
   * The preview is about a third the width of the render, and a five-pixel
   * chroma offset there would be three times the share of the picture it is in
   * the file. Fractions are the same at any size — which is the identical
   * reasoning behind the caption overlay measuring itself in `cqw`.
   */
  const UNITS = 'objectBoundingBox';

  /** A table transfer wants at least two points; one control point is a no-op. */
  const table = (points?: number[]) => (points && points.length > 1 ? points.join(' ') : null);

  /**
   * Room around the picture for offsets and blur to reach into.
   *
   * A filter region is the element's box by default, and anything a primitive
   * pushes outside it is clipped — a split would lose its edges and a blur
   * would stop dead at the frame. Ten per cent is far more than any of these
   * ask for.
   */
  const REGION = { x: '-10%', y: '-10%', w: '120%', h: '120%' };
</script>

<!-- Painted on rather than filtered: scan lines are a pattern over the picture,
     not something done to it. Under the captions, which the render burns on
     after the look and so leaves unlined. `rounded-lg` to match the video it
     covers, or the corners show through square. -->
{#each overlay as layer, index (index)}
  <div
    class="pointer-events-none absolute rounded-lg"
    style="inset: {layer.inset ?? '0'}; background: {layer.background ??
      'none'}; mix-blend-mode: {layer.blend ?? 'normal'}; opacity: {layer.opacity ??
      1}{layer.backdrop ? `; backdrop-filter: ${layer.backdrop}` : ''}"
    aria-hidden="true"
  ></div>
{/each}

<svg width="0" height="0" class="absolute" aria-hidden="true" focusable="false">
  <defs>
    {#each svg as look, index (index)}
      <!-- What the split works from: the graded picture when there is a curve,
           the untouched one when there isn't. Each channel has to be pulled
           from the same image, and naming `SourceGraphic` for two of the three
           would have quietly taken them from before the grade — a split whose
           red came from one picture and whose green came from another. -->
      {@const base = look.curves ? 'graded' : 'SourceGraphic'}
      <filter
        id="{id}-{index}"
        primitiveUnits={UNITS}
        x={REGION.x}
        y={REGION.y}
        width={REGION.w}
        height={REGION.h}
        color-interpolation-filters="sRGB"
      >
        {#if look.curves}
          <feComponentTransfer result="graded">
            {#if table(look.curves.r)}
              <feFuncR type="table" tableValues={table(look.curves.r)} />
            {/if}
            {#if table(look.curves.g)}
              <feFuncG type="table" tableValues={table(look.curves.g)} />
            {/if}
            {#if table(look.curves.b)}
              <feFuncB type="table" tableValues={table(look.curves.b)} />
            {/if}
          </feComponentTransfer>
        {/if}

        <!-- A channel split is the same picture three times, each keeping one
             colour, two of them nudged sideways and all three added back
             together. `screen` because the channels are light rather than
             paint: red over green over blue returns white where they line up,
             which is what "nothing has moved here" has to look like. -->
        {#if look.split}
          <feColorMatrix
            in={base}
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="chR"
          />
          <feOffset in="chR" dx={look.split.r ?? 0} result="offR" />
          <feColorMatrix
            in={base}
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="chG"
          />
          <feOffset in="chG" dx={look.split.g ?? 0} result="offG" />
          <feColorMatrix
            in={base}
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="chB"
          />
          <feOffset in="chB" dx={look.split.b ?? 0} result="offB" />
          <feBlend in="offR" in2="offG" mode="screen" result="rg" />
          <feBlend in="rg" in2="offB" mode="screen" />
        {/if}

        {#if look.blur}
          <feGaussianBlur stdDeviation={look.blur} />
        {/if}
      </filter>
    {/each}
  </defs>
</svg>
