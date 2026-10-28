<script lang="ts">
  /**
   * Everything about one caption, for when its block is too small to hold it.
   *
   * The block is the editor, and it stays the editor — this is what happens
   * when a caption is a second and a half long and the strip is zoomed out far
   * enough to see the whole clip. Six controls do not fit in forty pixels, and
   * they were spilling out over the blocks either side of it.
   *
   * Not a second way to do things, and deliberately not a place where anything
   * lives that isn't on the block. The same controls, the same order, given
   * room — so the answer to "where is the colour" is the same answer whether
   * you found it here or out there.
   *
   * Timing isn't here. Where a caption starts and stops is the one thing the
   * strip says better than any field could, and a caption too small to carry
   * its own buttons is one you can drag wider.
   */
  import { ColorWheel } from '$lib/components/ui';
  import BlockDialog from './BlockDialog.svelte';
  import EffectPicker from './EffectPicker.svelte';
  import { NO_BACKDROP, NO_BORDER } from '$lib/clips/types';
  import { captionText, normaliseCaptionHtml } from '$lib/clips/caption-html';
  import FontSelect from '$lib/components/ui/FontSelect.svelte';
  import RichTextEditor from '$lib/components/ui/RichTextEditor.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  /**
   * A hairline round every swatch.
   *
   * Black is a colour somebody picks — it is the default ring — and a black
   * circle on a panel this dark is nothing at all. A pale edge costs nothing
   * on the light ones and is the difference between a control and a hole on
   * the dark ones.
   */
  const EDGE = 'rgba(255, 255, 255, 0.25)';

  /** One shape for the three of them, so the row reads as one row. */
  const swatchTrigger =
    'flex items-center rounded p-1 transition-colors hover:bg-gray-700/60 text-gray-400';
  import type { AppliedEffect, CaptionAnchorId, TimedCaption } from '$lib/clips/types';

  interface Props {
    caption: TimedCaption;
    /** Which one it is, only so the heading can say. */
    index: number;
    anchors: { id: CaptionAnchorId; label: string; y: number }[];
    /** Which anchor it is on, worked out by the strip so both agree. */
    anchor: CaptionAnchorId;
    swatches: string[];
    /** The ring the clip draws, when this caption hasn't asked for one. */
    inheritedBorder?: string | null;
    /** And how heavy it draws it. */
    inheritedBorderWidth?: number;
    /** How solid the clip draws a panel, for the dial's own fallback. */
    inheritedBackdropOpacity?: number;
    /** The size this caption is drawn at when nothing in it says otherwise. */
    baseSize?: number;
    /** What it's drawn in, and sits on, when it hasn't said. */
    inheritedColor: string;
    inheritedBackdrop: string | null;
    /** How the clip says captions arrive, for the Auto button to name. */
    inheritedEffect?: AppliedEffect | null;
    /** The face being looked at in the list, before anything is chosen. */
    onpeekfont?: (id: string | null | undefined) => void;
    onkeepcolor?: (color: string) => void;
    onchange: (patch: Partial<TimedCaption>) => void;
    onremove: () => void;
    /** Shown in the selection panel rather than over the page. */
    inline?: boolean;
    /** An effect was chosen here — not a dial turned, not a colour changed. */
    onpickeffect?: () => void;
    onclose: () => void;
  }

  let {
    caption,
    index,
    anchors,
    anchor,
    swatches,
    inheritedColor,
    inheritedBackdrop,
    inheritedBorder = null,
    inheritedBorderWidth = 4,
    inheritedBackdropOpacity = 100,
    baseSize = 60,
    inheritedEffect = null,
    onpeekfont,
    onkeepcolor,
    onchange,
    onremove,
    onclose,
    inline = false,
    onpickeffect
  }: Props = $props();

  const label = 'text-xs font-medium tracking-wide text-gray-400 uppercase';

  /** How far the clip puts this caption's anchor up from the bottom. */
  const anchorY = $derived(anchors.find((a) => a.id === anchor)?.y ?? 0.18);
  const offsetY = $derived(caption.offsetY ?? 0);
  const offsetX = $derived(caption.offsetX ?? 0);
  /** Where it actually sits, which is what the slider holds. */
  const placedY = $derived(Math.min(0.95, Math.max(0.02, anchorY + offsetY)));

  /**
   * Close enough to an anchor to mean it.
   *
   * Within this the slider gives up its nudge and pins the caption to that
   * height, so dragging to roughly the bottom leaves it following the clip's
   * bottom dial rather than a number that happens to match it today.
   */
  const SNAP = 0.025;

  /**
   * Where it sits, in words: the height it is pinned to, and how far off it.
   *
   * "Bottom · nudged" said that something had been done without saying what,
   * which is the least useful half of the answer. A percentage of the frame is
   * the same number the slider moves in.
   */
  const placement = $derived.by(() => {
    const name = anchors.find((a) => a.id === anchor)?.label ?? 'Bottom';
    if (!offsetY) return name;
    const nudge = Math.round(offsetY * 100);
    return `${name} ${nudge > 0 ? '+' : ''}${nudge}%`;
  });

  function placeVertically(at: number) {
    let nearest = anchors[0];
    for (const option of anchors) {
      if (Math.abs(option.y - at) < Math.abs(nearest.y - at)) nearest = option;
    }

    const nudge = at - nearest.y;
    onchange({
      anchor: nearest.id,
      y: undefined,
      offsetY: Math.abs(nudge) < SNAP ? undefined : Number(nudge.toFixed(3))
    });
  }

  function placeSideways(at: number) {
    // The centreline is a real position, not a region to be near.
    onchange({ offsetX: Math.abs(at) < 0.02 ? undefined : Number(at.toFixed(3)) });
  }
  const choice =
    'rounded-lg border px-3 py-1.5 text-sm transition-colors border-gray-700 text-gray-300 hover:bg-gray-800';
  const chosen = 'rounded-lg border px-3 py-1.5 text-sm border-violet-500 bg-violet-600 text-white';
</script>

<!-- A dot of the colour it holds.
     The letters said the same thing three times — three identical A's in the
     same yellow, because they all take the caption's colour — so the one
     thing that distinguishes these controls, which is their colour, was the
     one thing they didn't show. A dot shows it and nothing else. -->
{#snippet dot(colour: string, none: boolean)}
  <span
    class="h-4 w-4 rounded-full {none ? 'border border-dashed border-gray-500' : ''}"
    style={none ? '' : `background-color: ${colour}; box-shadow: 0 0 0 1px ${EDGE};`}
  ></span>
{/snippet}

<!-- The ring, round what it rings.
     A border is a line on the outside, so the control for it is a circle that
     is mostly its own edge — filled with the caption's colour, because the
     usual ring is black and a black circle on a dark panel is nothing at
     all. -->
{#snippet ring(colour: string, none: boolean)}
  <span
    class="h-4 w-4 rounded-full border-2 {none ? 'border-dashed border-gray-500' : ''}"
    style="background-color: {caption.color || inheritedColor}; {none
      ? ''
      : `border-color: ${colour}; box-shadow: 0 0 0 1px ${EDGE};`}"
  ></span>
{/snippet}

<!-- No heading: "Caption 3" says only that you selected the third one, which
     you did on purpose a moment ago. The words come first. -->
<BlockDialog title={inline ? undefined : `Caption ${index + 1}`} {inline} {onremove} {onclose}>
  <!-- No heading. The field is plainly the words, and a panel that names
       every part of itself is a panel nobody reads.

       The same editor the rest of the admin writes in, with its marks on: a
       caption is burned into the picture by ffmpeg, so bold, italic and a
       size are ours to draw and no platform gets a say. Whatever it produces
       is normalised on the way out, so nothing downstream ever sees a `<span
       style="font-weight: 700">`.

       Keyed on which caption it is, because the editor takes its content once:
       without this, selecting the next caption would leave the last one's
       words in the box. -->
  {#key index}
    <RichTextEditor
      content={caption.text ?? ''}
      placeholder="Say something"
      emoji={false}
      newlines
      sizes={{ label: 'Size', base: baseSize, step: 2, uniform: true }}
      onUpdate={(value: string) => onchange({ text: normaliseCaptionHtml(value) })}
    />
  {/key}

  <!-- How the words are drawn: their colour, the panel behind them and the
       ring around them.

       Under the editor rather than in its toolbar, where they sat until it
       became clear why that read wrong: a toolbar button applies to what you
       have selected — that is what Bold means beside it — and these three are
       the caption's own, whole, however much of it is highlighted. Same
       glyphs, named, in a row of their own. -->
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-gray-500">
    <span class="flex items-center gap-1.5">
      <ColorWheel
        value={caption.color || inheritedColor}
        {swatches}
        compact
        title="Colour"
        onkeep={onkeepcolor}
        onchange={(c) => onchange({ color: c })}
        actions={[{ label: 'Auto', onclick: () => onchange({ color: null }) }]}
        triggerClass={swatchTrigger}
      >
        {#snippet trigger({ value, none })}
          {@render dot(value, none)}
        {/snippet}
      </ColorWheel>
      Colour
    </span>

    <span class="flex items-center gap-1.5">
      <ColorWheel
        value={caption.background ?? inheritedBackdrop ?? 'none'}
        {swatches}
        compact
        title="Backdrop"
        onkeep={onkeepcolor}
        alpha={{
          value: caption.backgroundOpacity ?? inheritedBackdropOpacity,
          onchange: (opacity) => onchange({ backgroundOpacity: opacity })
        }}
        onchange={(c) => onchange({ background: c })}
        actions={[
          { label: 'None', onclick: () => onchange({ background: NO_BACKDROP }) },
          { label: 'Auto', onclick: () => onchange({ background: null }) }
        ]}
        triggerClass={swatchTrigger}
      >
        {#snippet trigger({ value, none })}
          {@render dot(value, none)}
        {/snippet}
      </ColorWheel>
      Backdrop
    </span>

    <span class="flex items-center gap-1.5">
      <ColorWheel
        value={caption.border ?? inheritedBorder ?? 'none'}
        {swatches}
        compact
        title="Border"
        onkeep={onkeepcolor}
        amount={{
          label: 'Weight',
          value: caption.borderWidth ?? inheritedBorderWidth,
          min: 0,
          max: 16,
          hint: 'px',
          onchange: (width) => onchange({ borderWidth: width })
        }}
        onchange={(c) => onchange({ border: c })}
        actions={[
          { label: 'None', onclick: () => onchange({ border: NO_BORDER }) },
          { label: 'Auto', onclick: () => onchange({ border: null }) }
        ]}
        triggerClass={swatchTrigger}
      >
        {#snippet trigger({ value, none })}
          {@render ring(value, none)}
        {/snippet}
      </ColorWheel>
      Border
    </span>
  </div>

  <!-- Its own face, when it wants one.
       Below the row rather than in it: the three above are swatches and this
       is a name, so putting it among them would make the row two kinds of
       control wearing one shape. -->
  <FontSelect
    value={caption.font || null}
    auto={{ label: 'Base font' }}
    onpeek={onpeekfont}
    onchange={(id) => {
      onpeekfont?.(undefined);
      onchange({ font: id });
    }}
    sample={captionText(caption.text) || 'Hamburgefonstiv'}
  />

  <!-- Placement, not height: there are two axes now.
       The named heights are still what a caption is pinned to — move the
       clip's bottom dial and everything on `bottom` moves with it — so the
       slider snaps to them and anything between is kept as a nudge from the
       nearest one. The marks on the track are where those are. -->
  <div class="space-y-3">
    <div>
      <div class="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-gray-500">
        <span>Up and down</span>
        <!-- Where it sits, and the way back. No "Placement" over the pair:
             the sliders say what they are. -->
        <span class="flex items-center gap-2">
          <span class="text-gray-400">{placement}</span>
          {#if offsetY || offsetX}
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50"
              onclick={() => onchange({ offsetY: undefined, offsetX: undefined })}
            >
              Reset
            </button>
          {/if}
        </span>
      </div>
      <!-- Left is up, which is what the label says if you read it in order.
           Everything underneath measures *up from the bottom*, because that is
           what the render's margins do and what the anchors are stored in — so
           the slider carries the distance down from the top and turns it over
           on the way in and out. One flip here rather than a different idea of
           which way is up in four places. -->
      <Slider
        value={1 - placedY}
        min={1 - 0.95}
        max={1 - 0.02}
        step={0.005}
        label="Up and down"
        marks={anchors.map((a) => 1 - a.y)}
        onchange={(at) => placeVertically(1 - at)}
      />
    </div>

    <div>
      <span class="mb-1 block text-[11px] text-gray-500">Left and right</span>
      <Slider
        value={offsetX}
        min={-0.35}
        max={0.35}
        step={0.005}
        label="Left and right"
        marks={[0]}
        onchange={placeSideways}
      />
    </div>
  </div>

  <div>
    <span class={label}>Effect</span>
    <!-- Below the placement and above the colours because it is the same kind
         of decision as both: how this caption differs from the rest, if it
         does. (Size used to sit here too; it is in the editor's own toolbar
         now, where it applies to the words rather than to the caption.) -->
    <div class="mt-1">
      <EffectPicker
        value={caption.effect}
        inherited={inheritedEffect}
        canInherit
        {swatches}
        onchange={(effect) => onchange({ effect })}
        onpick={() => onpickeffect?.()}
      />
    </div>
  </div>
</BlockDialog>
