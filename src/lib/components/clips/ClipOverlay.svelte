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
  import { captionBackdrop, captionColor, captionY } from '$lib/clips/types';
  import { captionEffectOf, captionSeed } from '$lib/clips/effects';
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
   * The same one sum in both places, from the same table: the anchor the
   * caption is on, at the height this clip's dials put that anchor. It used to
   * be three sets of numbers measured from three different edges, and a caption
   * could sit somewhere here that it did not sit in the render.
   */
  const placeCaption = (caption: TimedCaption) => `bottom: ${captionY(caption, adv) * 100}%`;

  /**
   * What the caption's effect wants done to it at this instant.
   *
   * The render asks the same effect the same question once and gets an answer
   * covering the caption's whole life, because libass animates itself. This is
   * scrubbed rather than played — the overlay is handed a time and draws it —
   * so it asks per frame and gets one moment back. Same effect, same dials, the
   * two halves of one object, which is what stops the preview and the file
   * drifting apart the way two sets of rules always do.
   *
   * Copies come back split by whether they belong over the caption or under it.
   * Under is the ordinary case: a colour split is fringes either side of the
   * words. Over is what a panel forces, since a copy behind an opaque box is a
   * copy nobody sees — the same reasoning, and the same answer, as the render.
   */
  function dressing(caption: TimedCaption) {
    const { effect, params } = captionEffectOf(caption, config);
    const drawn = effect.css({
      params,
      elapsed: at - caption.start,
      duration: Math.max(0, caption.end - caption.start),
      // The nominal frame, so a dial in render pixels means the same share of
      // the picture here as it does in the file.
      width: frame.w,
      height: frame.h,
      color: captionColor(caption, config, accent),
      backdrop: captionBackdrop(caption, config),
      seed: captionSeed(caption),
      // Only `\move` on the render side reads this; nothing here does.
      y: frame.h - captionY(caption, adv) * frame.h
    });
    const copies = drawn.copies ?? [];
    return {
      style: drawn.style ?? '',
      under: copies.filter((copy) => !copy.over),
      over: copies.filter((copy) => copy.over)
    };
  }

  /**
   * The panel behind a caption, at the solidity the clip asks for.
   *
   * Written as `rgb(... / ...)` rather than a Tailwind class because the colour
   * is data: there is no class for "whatever this caption picked", and a hex
   * with an alpha pair appended is the one spelling browsers and libass agree
   * to disagree about.
   */
  function panel(backdrop: string | null): string {
    if (!backdrop) return '';
    const hex = backdrop.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `background-color: rgb(${r} ${g} ${b} / ${adv.captionBackdropPercent}%)`;
  }

  /** The same band the render puts the big logo in, kept clear of the caption. */
  const logoBand = 0.36;
</script>

<!-- `container-type: size` so the text can be sized in `cqh` — a share of this
     box's height — which is the only unit that means the same thing here as a
     divisor of PlayResY means to libass. -->
<div
  class="pointer-events-none absolute inset-0 overflow-hidden"
  style="container-type: size"
  aria-hidden="true"
>
  <!-- One caption, drawn once — and the copies an effect asks for are the same
       words in the same place, so they are this snippet too rather than a
       second piece of markup that has to be kept in step with it. A copy never
       draws the panel or the outline: those belong to the caption, and a stack
       of them is how a split turns into a smudge. -->
  {#snippet line(caption: TimedCaption, extra: string, copy: boolean)}
    <!-- `pre-line` so a caption written across two lines is drawn across two,
         the way `assText` turns the same newline into libass's `\N`. -->
    <div
      class="absolute right-0 left-0 text-center leading-tight font-bold whitespace-pre-line"
      style="{placeCaption(caption)}; padding-inline: {(adv.captionMarginX / frame.w) *
        100}cqw; font-size: {caption.headline ? headSize : capSize}cqh; color: {captionColor(
        caption,
        config,
        accent
      )}; {captionBackdrop(caption, config) || copy
        ? ''
        : 'text-shadow: 0 0 0.18em #000, 0 0 0.06em #000, 0.02em 0.03em 0.05em #000;'} {extra}"
    >
      <span
        class={captionBackdrop(caption, config) && !copy
          ? 'box-decoration-clone px-[0.35em] py-[0.12em]'
          : ''}
        style={copy ? '' : panel(captionBackdrop(caption, config))}
      >
        {caption.text}
      </span>
    </div>
  {/snippet}

  {#each showing as caption, index (index)}
    {@const fx = dressing(caption)}
    {#each fx.under as copy, i (i)}{@render line(caption, copy.style, true)}{/each}
    {@render line(caption, fx.style, false)}
    {#each fx.over as copy, i (i)}{@render line(caption, copy.style, true)}{/each}
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
