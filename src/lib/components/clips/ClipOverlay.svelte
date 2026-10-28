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
  import {
    captionBackdrop,
    captionBorder,
    captionBorderWidth,
    CAPTION_SIZE_DIVISOR,
    captionBackdropOpacity,
    captionFontId,
    captionColor,
    captionX,
    captionY
  } from '$lib/clips/types';
  import { untrack } from 'svelte';
  import { fontStack } from '$lib/fonts';
  import { captionEffectOf, captionSeed } from '$lib/clips/effects';
  import { captionIsEmpty, normaliseCaptionHtml } from '$lib/clips/caption-html';
  import type { ClipRenderConfig, ClipAdvancedConfig, TimedCaption } from '$lib/clips/types';

  let {
    captions,
    config,
    adv,
    /** Where the clip is, in seconds, so the right caption is showing. */
    at,
    /** The branding graphic, already resolved by the page. */
    graphic = null,
    /**
     * The watermark's own, when it differs from the intro's.
     *
     * The three stages can each carry a mark now, and the two this draws are
     * the two that can disagree on screen. Absent falls back to `graphic`,
     * which is what happens whenever a clip has not given either its own.
     */
    watermarkGraphic = null,
    /** How long the intro logo stays up. Zero when there is no intro. */
    introSeconds = 0,
    accent = '#8b5cf6',
    rehearse = null
  }: {
    captions: TimedCaption[];
    config: ClipRenderConfig;
    adv: ClipAdvancedConfig;
    at: number;
    graphic?: string | null;
    watermarkGraphic?: string | null;
    introSeconds?: number;
    accent?: string;
    /**
     * Run one caption's entrance here, without moving the clip.
     *
     * An entrance only exists in motion, and parked after it every one of them
     * looks the same — the caption, arrived. Choosing one is asking what it
     * does, and the cheapest honest answer is to run that caption's own clock
     * for as long as the entrance lasts. The playhead stays where it is and
     * nothing plays: the question was about the words, not the shot.
     *
     * `token` changes to ask again, so pressing the same effect twice shows it
     * twice.
     */
    rehearse?: { index: number; token: number } | null;
  } = $props();

  /** How far into its own entrance the rehearsed caption is, while it runs. */
  let rehearsedAt = $state<number | null>(null);

  $effect(() => {
    const asked = rehearse;
    if (!asked) return;
    // Read, so asking again with the same index starts it over.
    void asked.token;

    /*
     * Looked up without being watched.
     *
     * Every save hands down a fresh `captions`, and a save happens whenever
     * anything on the clip changes — a shot's look included. Reading the array
     * here made all of that re-enter this effect, so picking a look for a video
     * replayed a caption's entrance instead.
     */
    const line = untrack(() => captions[asked.index]);
    if (captionIsEmpty(line?.text)) return;

    // Long enough for the slowest entrance to land, and to hold a beat after.
    const span = Math.min(1.2, Math.max(0.05, line.end - line.start));
    const from = performance.now();
    let frame = 0;

    const step = () => {
      const elapsed = (performance.now() - from) / 1000;
      if (elapsed >= span) {
        rehearsedAt = null;
        return;
      }
      rehearsedAt = elapsed;
      frame = requestAnimationFrame(step);
    };
    step();

    return () => {
      cancelAnimationFrame(frame);
      rehearsedAt = null;
    };
  });

  /** The caption being rehearsed, while it is being rehearsed. */
  const rehearsing = $derived(
    rehearse && rehearsedAt != null ? (captions[rehearse.index] ?? null) : null
  );

  /*
   * What is on screen: whatever the playhead is inside, plus the one being
   * rehearsed — which may be nowhere near the playhead, and is the whole point
   * of being asked about.
   */
  const showing = $derived(
    captions.filter(
      (c) =>
        !captionIsEmpty(c.text) &&
        ((at >= c.start && at < c.end) || (rehearsing != null && c === rehearsing))
    )
  );

  /*
   * `capSize` is the render's width over a divisor, and the width of a 9:16
   * frame is 9/16 of its height — so as a share of height the same number is
   * (9/16)/divisor. Expressed against height because that is what `cqh` gives
   * us, and what stays true whatever size the element is drawn at.
   */
  /**
   * A caption's markup, with its sizes read against the frame.
   *
   * A size is stored in the frame's own pixels — the same number libass is
   * given — so here it becomes a share of the frame's height, which is what
   * `cqh` already measures everything else in. The pane can then be any width
   * at all and the words keep the proportions the file will have.
   */
  function inFrame(html: string): string {
    return normaliseCaptionHtml(html).replace(
      /font-size:\s*(\d+(?:\.\d+)?)px/g,
      (_, px) => `font-size: ${((Number(px) / frame.h) * 100).toFixed(3)}cqh`
    );
  }
  /**
   * The ring around the letters, as a shadow.
   *
   * The render draws a real outline; a stack of shadows is the browser's
   * nearest honest likeness, and it has been drawing one in black all along.
   * All that changes here is that the colour is asked for rather than assumed.
   *
   * Never on a panel — there the box is the outline — and never on a copy: a
   * colour split is three copies a few pixels apart, and ringing each of them
   * turns the split into a smudge.
   */
  function ring(caption: TimedCaption, copy: boolean): string {
    // A panel no longer rules an outline out: the render stacks a panelled
    // line under a plain one to get both, and CSS draws them on one element.
    if (copy) return '';
    const colour = captionBorder(caption, config);
    if (!colour) return '';

    /*
     * A stroke, not a glow.
     *
     * This was a stack of blurred shadows scaled by the weight, which at four
     * pixels passes for an outline and at twelve is plainly a halo — the
     * render draws `\bord`, a hard line round the glyph, and the preview was
     * drawing something else entirely.
     *
     * Doubled, because the two draw it differently: libass puts its outline
     * *outside* the glyph, while `-webkit-text-stroke` straddles the edge and
     * the fill covers the inner half. Twice the width leaves the asked-for
     * amount showing, which is what both then look like.
     *
     * In `cqh`, like everything else here, so a weight stated in the frame's
     * pixels is the same share of the picture at any size the pane happens to
     * be.
     */
    const width = (captionBorderWidth(caption, config) * 2 * 100) / frame.h;
    return `-webkit-text-stroke: ${width.toFixed(3)}cqh ${colour}; paint-order: stroke fill;`;
  }

  const aspect = $derived(config.aspect === '1:1' ? 1 : config.aspect === '16:9' ? 16 / 9 : 9 / 16);
  const capSize = $derived((aspect / CAPTION_SIZE_DIVISOR) * 100);

  /*
   * The face the render will burn in, drawn here too.
   *
   * The same file either way — the browser loads the woff2, the renderer
   * unpacks the same font to TrueType for libass — so this is a likeness in
   * the one respect the overlay could never manage before. Per caption,
   * because a caption can ask for its own the way it asks for its own colour.
   * Nothing chosen at either level leaves it to the page's own font, which is
   * the honest picture of "whatever the server finds": not the font, but not a
   * promise either.
   */
  function captionFamily(caption: TimedCaption): string {
    const id = captionFontId(caption, config);
    return id ? fontStack(id) : 'inherit';
  }

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
  /*
   * Where it sits: up from the bottom, and off centre by the same share of the
   * width the render shifts its margins by. Moving both insets by the offset
   * moves the centre and leaves the width — and so the wrapping — alone.
   */
  const placeCaption = (caption: TimedCaption) => {
    const dx = captionX(caption) * 100;
    return `bottom: ${captionY(caption, adv) * 100}%; left: ${dx}cqw; right: ${-dx}cqw`;
  };

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
      // A rehearsed caption runs on its own clock; everything else on the
      // clip's.
      elapsed: caption === rehearsing && rehearsedAt != null ? rehearsedAt : at - caption.start,
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
  function panel(caption: TimedCaption, backdrop: string | null): string {
    if (!backdrop) return '';
    const hex = backdrop.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `background-color: rgb(${r} ${g} ${b} / ${captionBackdropOpacity(caption)}%)`;
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
      style="{placeCaption(caption)}; font-family: {captionFamily(
        caption
      )}; padding-inline: {(adv.captionMarginX / frame.w) *
        100}cqw; font-size: {capSize}cqh; color: {captionColor(caption, config, accent)}; {ring(
        caption,
        copy
      )} {extra}"
    >
      <span
        class={captionBackdrop(caption, config) && !copy
          ? 'box-decoration-clone px-[0.35em] py-[0.12em]'
          : ''}
        style={copy ? '' : panel(caption, captionBackdrop(caption, config))}
      >
        <!-- The caption's own markup — `<b>`, `<i>`, `<s>` and nothing else,
             because `normaliseCaptionHtml` is the only way text gets in here
             and it keeps nothing else. Rendered rather than printed so a mark
             is a mark, the way the render draws it. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html inFrame(caption.text ?? '')}
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
  {#if (watermarkGraphic ?? graphic) && config.watermark && at >= introSeconds}
    <img
      src={watermarkGraphic ?? graphic}
      alt=""
      class="absolute"
      style="left: {(adv.watermarkX / frame.w) * 100}cqw; top: {(adv.watermarkY / frame.h) *
        100}cqh; width: {adv.watermarkWidthPercent}cqw"
    />
  {/if}
</div>
