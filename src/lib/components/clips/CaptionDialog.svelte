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
  import { NO_BACKDROP } from '$lib/clips/types';
  import type { AppliedEffect, CaptionAnchorId, TimedCaption } from '$lib/clips/types';

  interface Props {
    caption: TimedCaption;
    /** Which one it is, only so the heading can say. */
    index: number;
    anchors: { id: CaptionAnchorId; label: string; y: number }[];
    /** Which anchor it is on, worked out by the strip so both agree. */
    anchor: CaptionAnchorId;
    swatches: string[];
    /** What it's drawn in, and sits on, when it hasn't said. */
    inheritedColor: string;
    inheritedBackdrop: string | null;
    /** How the clip says captions arrive, for the Auto button to name. */
    inheritedEffect?: AppliedEffect | null;
    onkeepcolor?: (color: string) => void;
    onchange: (patch: Partial<TimedCaption>) => void;
    onremove: () => void;
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
    inheritedEffect = null,
    onkeepcolor,
    onchange,
    onremove,
    onclose
  }: Props = $props();

  const label = 'text-xs font-medium tracking-wide text-gray-400 uppercase';
  const choice =
    'rounded-lg border px-3 py-1.5 text-sm transition-colors border-gray-700 text-gray-300 hover:bg-gray-800';
  const chosen = 'rounded-lg border px-3 py-1.5 text-sm border-violet-500 bg-violet-600 text-white';
</script>

<BlockDialog title="Caption {index + 1}" {onremove} {onclose}>
  <div>
    <label class={label} for="caption-text">Words</label>
    <!-- A textarea, not the block's single-line field: there is room here, so
           a line break can be a line break rather than a bar standing in for
           one. Both write the same newline. -->
    <textarea
      id="caption-text"
      rows="3"
      value={caption.text}
      oninput={(e) => onchange({ text: e.currentTarget.value })}
      placeholder="Say something"
      class="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-violet-500 focus:outline-none"
    ></textarea>
  </div>

  <div>
    <span class={label}>Height</span>
    <div class="mt-1 flex gap-2">
      {#each anchors as option (option.id)}
        <button
          type="button"
          onclick={() => onchange({ anchor: option.id, y: undefined })}
          class={option.id === anchor ? chosen : choice}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <div>
    <span class={label}>Size</span>
    <div class="mt-1 flex gap-2">
      <button
        type="button"
        onclick={() => onchange({ headline: false })}
        class={caption.headline ? choice : chosen}
      >
        Normal
      </button>
      <button
        type="button"
        onclick={() => onchange({ headline: true })}
        class={caption.headline ? chosen : choice}
      >
        Big
      </button>
    </div>
  </div>

  <div>
    <span class={label}>Effect</span>
    <!-- Below Size and above Colour because it is the same kind of decision as
         both: how this caption differs from the rest, if it does. -->
    <div class="mt-1">
      <EffectPicker
        value={caption.effect}
        inherited={inheritedEffect}
        canInherit
        {swatches}
        onchange={(effect) => onchange({ effect })}
      />
    </div>
  </div>

  <div class="flex gap-8">
    <div>
      <span class={label}>Colour</span>
      <div class="mt-1">
        <ColorWheel
          value={caption.color || inheritedColor}
          {swatches}
          onkeep={onkeepcolor}
          onchange={(c) => onchange({ color: c })}
          actions={[{ label: 'Auto', onclick: () => onchange({ color: null }) }]}
        />
      </div>
    </div>

    <div>
      <span class={label}>Backdrop</span>
      <div class="mt-1">
        <ColorWheel
          value={caption.background ?? inheritedBackdrop ?? 'none'}
          {swatches}
          onkeep={onkeepcolor}
          onchange={(c) => onchange({ background: c })}
          actions={[
            { label: 'None', onclick: () => onchange({ background: NO_BACKDROP }) },
            { label: 'Auto', onclick: () => onchange({ background: null }) }
          ]}
        />
      </div>
    </div>
  </div>
</BlockDialog>
