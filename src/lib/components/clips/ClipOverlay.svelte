<script lang="ts">
  /**
   * The captions, the logo and the watermark, drawn over the picture rather than
   * into it.
   *
   * A proof exists to answer "is this in the right place", and until now every
   * answer cost a render — retype a caption, wait a minute, look. These are the
   * three things that are pure overlay: they sit on top of whatever is
   * underneath and change nothing about it, so the browser can put them there
   * for nothing and the render only has to when the file is going out.
   *
   * A fair likeness, not a copy. Browser text and libass disagree about metrics,
   * wrapping and outlines, so this is the right answer to *where* and *when* and
   * a slightly wrong one to *exactly how it looks* — the same trade the proof
   * itself already makes by rendering at half size with black bars.
   *
   * The geometry is deliberately written as fractions of the video's own height
   * rather than pixels, because that is how `buildAss` works: it sets PlayResX
   * and PlayResY to the render's dimensions and sizes everything by dividing
   * them. Ratios survive the difference between a 1080-wide render and a
   * 340-wide element; pixels would not.
   */
  import { CAPTION_ANCHORS } from '$lib/clips/types';
  import type { ClipRenderConfig, ClipAdvancedConfig, TimedCaption } from '$lib/clips/types';

  let {
    captions,
    config,
    adv,
    /** Where the clip is, in seconds, so the right caption is showing. */
    at,
    /** The branding graphic, already resolved by the page. */
    graphic = null,
    /** How long the intro logo stays up. Zero when there is no intro. */
    introSeconds = 0,
    accent = '#8b5cf6'
  }: {
    captions: TimedCaption[];
    config: ClipRenderConfig;
    adv: ClipAdvancedConfig;
    at: number;
    graphic?: string | null;
    introSeconds?: number;
    accent?: string;
  } = $props();

  const showing = $derived(captions.filter((c) => c.text?.trim() && at >= c.start && at < c.end));

  /*
   * `capSize` is the render's width over a divisor, and the width of a 9:16
   * frame is 9/16 of its height — so as a share of height the same number is
   * (9/16)/divisor. Expressed against height because that is what `cqh` gives
   * us, and what stays true whatever size the element is drawn at.
   */
  const aspect = $derived(config.aspect === '1:1' ? 1 : config.aspect === '16:9' ? 16 / 9 : 9 / 16);
  const capSize = $derived((aspect / adv.captionSizeDivisor) * 100);
  const headSize = $derived((aspect / adv.headlineSizeDivisor) * 100);

  /*
   * The frame the renderer measures in, so pixel dials can be read as shares.
   *
   * `watermarkX`, `watermarkY` and `captionMarginX` are pixel counts against
   * the finished clip's dimensions — 48px in a 1080-wide frame — and mean
   * nothing to an element a third that size. Divided by the nominal frame they
   * become percentages, which is what both the render and this agree on.
   */
  const frame = $derived(
    config.aspect === '1:1'
      ? { w: 1080, h: 1080 }
      : config.aspect === '16:9'
        ? { w: 1920, h: 1080 }
        : { w: 1080, h: 1920 }
  );

  /**
   * Where a caption sits, exactly as `buildAss` places it.
   *
   * Anchored or not, it is the same sum: a share of the height, up from the
   * bottom. An anchored caption carries its own `y`; one without takes the
   * anchor its clip is set to.
   *
   * Both the render and this read `CAPTION_ANCHORS`, so there is one table and
   * moving a number in it moves the caption in both places. It used to be three
   * sets of numbers measured from three different edges, and an anchored
   * caption could sit somewhere an unanchored one at the same setting did not.
   */
  function placeCaption(caption: TimedCaption): string {
    const anchor = CAPTION_ANCHORS.find((a) => a.id === defaultAnchor);
    return `bottom: ${(caption.y ?? anchor?.y ?? 0.18) * 100}%`;
  }

  const defaultAnchor = $derived(
    config.captionPosition === 'top'
      ? 'top'
      : config.captionPosition === 'center'
        ? 'middle'
        : 'bottom'
  );

  const colour = $derived(config.colorizeCaption ? accent : '#ffffff');

  /** The same band the render puts the big logo in, kept clear of the caption. */
  const logoBand = $derived(
    config.captionPosition === 'top' ? 0.62 : config.captionPosition === 'center' ? 0.4 : 0.36
  );
</script>

<!-- `container-type: size` so the text can be sized in `cqh` — a share of this
     box's height — which is the only unit that means the same thing here as a
     divisor of PlayResY means to libass. -->
<div
  class="pointer-events-none absolute inset-0 overflow-hidden"
  style="container-type: size"
  aria-hidden="true"
>
  {#each showing as caption, index (index)}
    <div
      class="absolute right-0 left-0 text-center leading-tight font-bold"
      style="{placeCaption(caption)}; padding-inline: {(adv.captionMarginX / frame.w) *
        100}cqw; font-size: {caption.headline
        ? headSize
        : capSize}cqh; color: {colour}; {config.captionBackground
        ? ''
        : 'text-shadow: 0 0 0.18em #000, 0 0 0.06em #000, 0.02em 0.03em 0.05em #000;'}"
    >
      <span
        class={config.captionBackground
          ? 'bg-black/50 box-decoration-clone px-[0.35em] py-[0.12em]'
          : ''}
      >
        {caption.text}
      </span>
    </div>
  {/each}

  <!-- The opening logo, at full opacity on the first frame and fading out — the
       same shape as the render's, which puts it there so the in-feed thumbnail
       is branded. -->
  {#if graphic && config.intro && introSeconds > 0 && at < introSeconds}
    <img
      src={graphic}
      alt=""
      class="absolute left-1/2 transition-opacity duration-300"
      style="width: {adv.logoWidthPercent}cqw; top: {logoBand *
        100}%; transform: translate(-50%, -50%); opacity: {at > introSeconds - 0.4 ? 0 : 1}"
    />
  {/if}

  <!-- And the standing one, which starts once the intro has gone.

       Placed from `watermarkX`/`watermarkY`, which are offsets from the top
       left — the corner the render's `overlay` measures from. It was drawn in
       the opposite corner here, which looked deliberate and was simply wrong. -->
  {#if graphic && config.watermark && at >= introSeconds}
    <img
      src={graphic}
      alt=""
      class="absolute"
      style="left: {(adv.watermarkX / frame.w) * 100}cqw; top: {(adv.watermarkY / frame.h) *
        100}cqh; width: {adv.watermarkWidthPercent}cqw"
    />
  {/if}
</div>
