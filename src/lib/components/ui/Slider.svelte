<script lang="ts">
  /**
   * A range that commits when the hand lets go.
   *
   * A range bound straight to its stored value fights whoever is holding it:
   * each movement is applied, saved, read back and handed down again, so the
   * thumb snaps to whatever arrived last — and a drag across the track is a
   * write per pixel on the way. The thumb follows the pointer here, and the
   * value is handed over once, when the gesture ends.
   *
   * Written once rather than three times: the size menu, a caption's placement
   * and a colour's weight all had their own copy of this, and the first two
   * had the bug.
   *
   * `onmove` is for the rare caller that wants the value during the drag —
   * something that only paints, never saves.
   */
  let {
    value,
    min,
    max,
    step = 1,
    label,
    marks = [],
    onchange,
    onmove,
    class: className = ''
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    label: string;
    /** Positions worth drawing on the track, in the same units as the value. */
    marks?: number[];
    /** The value, once the drag is over. */
    onchange: (value: number) => void;
    /** The value while it moves, for anything that costs nothing to redraw. */
    onmove?: (value: number) => void;
    class?: string;
  } = $props();

  let dragging = $state<number | null>(null);
  const thumb = $derived(dragging ?? value);

  const share = (at: number) => ((at - min) / (max - min)) * 100;
</script>

<div class="relative {className}">
  {#if marks.length}
    <!-- Where the detents are, drawn on the track they snap to. -->
    <div class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
      {#each marks as mark (mark)}
        <span
          class="absolute h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-gray-600"
          style="left: {share(mark)}%"
        ></span>
      {/each}
    </div>
  {/if}

  <input
    type="range"
    {min}
    {max}
    {step}
    value={thumb}
    aria-label={label}
    class="relative w-full accent-violet-500"
    oninput={(e) => {
      const at = Number(e.currentTarget.value);
      dragging = at;
      onmove?.(at);
    }}
    onchange={(e) => {
      dragging = null;
      onchange(Number(e.currentTarget.value));
    }}
  />
</div>
