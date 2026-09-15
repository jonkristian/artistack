<script lang="ts">
  /**
   * Picking an effect, and turning whatever dials it happens to have.
   *
   * Nothing in here knows the name of a single effect. The list comes from the
   * registry and the controls come from the parameters each effect declares, so
   * a new pack arrives here without this file being touched — which is the
   * whole reason the parameters are declared rather than drawn. A picker with
   * the dials hand-written into it would mean every new effect was also a UI
   * change, and the ones nobody got round to would ship without their controls.
   *
   * One component for both families, because picking an effect is the same act
   * whether it happens to the words or to the picture. What differs is only what
   * "none of them" means, and that is one label: a caption can hand the decision
   * back to the clip, while footage with nothing on it is just footage.
   */
  import { ColorWheel, ToggleSwitch } from '$lib/components/ui';
  import { PACKS, effectById, pictureEffectById, effectParams } from '$lib/clips/effects';
  import { numberClass } from '$lib/utils/classes';
  import type { AppliedEffect } from '$lib/clips/types';

  let {
    value,
    inherited = null,
    canInherit = false,
    family = 'caption',
    swatches = [],
    clipId = null,
    onchange
  }: {
    /** What's set here. Null or absent means it defers, or that there is none. */
    value?: AppliedEffect | null;
    /** What it defers to, so the button can say which one that is. */
    inherited?: AppliedEffect | null;
    canInherit?: boolean;
    family?: 'caption' | 'picture';
    swatches?: string[];
    /**
     * The clip to draw the swatches from, when there are swatches to draw.
     *
     * A footage effect can be shown rather than described, using a frame of
     * this clip's own footage — which is the only version of the answer worth
     * having, since what a grade does depends entirely on what it is done to.
     * Absent falls back to names, which is what the caption family always uses:
     * an entrance is a movement, and a still of one is a still of nothing.
     */
    clipId?: number | null;
    onchange: (value: AppliedEffect | null) => void;
  } = $props();

  /**
   * What each pack offers in this family. A pack with nothing in it — the
   * entrances have no footage effects — drops out rather than drawing a heading
   * over an empty row.
   */
  const groups = $derived(
    PACKS.map((pack) => ({
      id: pack.id,
      label: pack.label,
      effects: (family === 'caption' ? pack.captions : pack.picture) ?? []
    })).filter((group) => group.effects.length)
  );

  /**
   * Which one is in force.
   *
   * The two families disagree about the empty case, and this is the only place
   * that shows. A caption always draws, so nothing set means the plain fade; a
   * picture effect set to nothing means the footage is left alone.
   */
  const applied = $derived(value ?? (canInherit ? null : (inherited ?? null)));
  const chosen = $derived(
    family === 'picture'
      ? pictureEffectById(applied?.id)
      : applied || !canInherit
        ? effectById(applied?.id)
        : null
  );
  const params = $derived(chosen ? effectParams(chosen, applied) : {});
  const inheritedLabel = $derived(effectById(inherited?.id).label);

  /**
   * Whether to show the looks rather than name them.
   *
   * Only the footage family, and only once there is a clip to take a frame
   * from. A caption effect is a movement — a pop, a rise, a tear that lasts a
   * sixth of a second — and a still of a movement is a still of nothing, so
   * those stay as names whatever else happens.
   */
  const showSwatches = $derived(family === 'picture' && clipId != null);

  /**
   * Only what differs from the effect's own defaults is stored.
   *
   * So that improving an effect's defaults improves every clip that never
   * argued with them, rather than only the ones made afterwards.
   */
  function setParam(key: string, next: number | string | boolean) {
    if (!chosen) return;
    const defaults = effectParams(chosen, null);
    const kept: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries({ ...params, [key]: next })) {
      if (v !== defaults[k]) kept[k] = v;
    }
    onchange({ id: chosen.id, ...(Object.keys(kept).length ? { params: kept } : {}) });
  }
</script>

<!-- One choice, so one list — and one shape, so the two pickers read as the
     same control.

     The packs used to be headings over their own rows, which drew three lists
     and implied you could take something from each; you cannot, an effect
     replaces whatever was there. The grouping is how the effects are written
     and filed, not a question anyone is being asked here.

     Captions are tiles now as well. They were pill buttons beside the footage
     tiles and the two panels looked like different kinds of thing when they
     are the same kind of choice. The one deliberate difference is the height of
     the picture area: a footage look can be shown on a frame, and an entrance
     cannot — a still of a movement is a still of nothing — so a caption tile
     keeps the shape and gives that space back rather than holding six empty
     four-by-three rectangles that read as images which failed to load. -->
<div class="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <!-- A grid of four rather than a wrapping row, so the tiles are four to a
       line at any width instead of however many happen to fit — and they fill
       the column rather than leaving a ragged margin down the right of it.
       `items-start`, or each one stretches to its row's height. -->
  <div class="grid min-w-0 grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
    {#if canInherit || family === 'picture'}
      <button
        type="button"
        onclick={() => onchange(null)}
        class="self-start overflow-hidden rounded-lg border text-left transition-colors {value
          ? 'border-gray-700 hover:border-gray-500'
          : 'border-violet-500'}"
      >
        <span class="block w-full bg-gray-950 {showSwatches ? 'aspect-[4/3]' : 'h-9'}"></span>
        <span class="block w-full truncate px-2 py-1.5 text-xs text-gray-300">
          {canInherit ? `Auto (${inheritedLabel})` : 'None'}
        </span>
      </button>
    {/if}

    {#each groups as group (group.id)}
      {#each group.effects as effect (effect.id)}
        <button
          type="button"
          title={effect.description}
          onclick={() => onchange({ id: effect.id })}
          class="self-start overflow-hidden rounded-lg border text-left transition-colors {chosen?.id ===
          effect.id
            ? 'border-violet-500'
            : 'border-gray-700 hover:border-gray-500'}"
        >
          {#if showSwatches}
            <!-- A frame of this clip's own footage with the look on it — but
                 only where a still can carry one. `stillSafe` is off for
                 anything needing motion, and the route returns nothing for it,
                 so the tile would be a black rectangle pretending to be a
                 preview. The word is honest. -->
            {#if 'stillSafe' in effect && effect.stillSafe}
              <img
                src="/admin/clips/{clipId}/effect/{effect.id}"
                alt=""
                loading="lazy"
                class="aspect-[4/3] w-full bg-gray-950 object-cover"
              />
            {:else}
              <span
                class="flex aspect-[4/3] w-full items-center justify-center bg-gray-950 text-[10px] text-gray-600"
              >
                moves
              </span>
            {/if}
          {:else}
            <span class="block h-9 w-full bg-gray-950"></span>
          {/if}
          <span class="block w-full truncate px-2 py-1.5 text-xs text-gray-300">{effect.label}</span
          >
        </button>
      {/each}
    {/each}
  </div>

  <!-- What the chosen one is, and its dials, in two columns of its own. -->
  {#if chosen}
    <div
      class="grid min-w-0 grid-cols-1 gap-x-3 gap-y-1.5 self-start sm:border-l sm:border-gray-800 sm:pl-4"
    >
      <p class="col-span-2 mb-1 text-xs text-gray-500">{chosen.description}</p>

      {#if chosen.params?.length}
        {#each chosen.params as param (param.key)}
          <!-- One dial per row, and the label yields before the control does.

               Two columns fitted in the viewport and not in the cell: the
               dials live in the narrower half of a `max-w-2xl` dialog, so each
               of the two was about 130px and "Amount" truncated to "A…" beside
               its own number. A viewport breakpoint cannot know that — it is
               the container that is narrow, not the window. One column always
               fits, and there are never more than a handful of dials. -->
          <div class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-xs text-gray-400" title={param.label}>
              {param.label}
            </span>
            {#if param.type === 'toggle'}
              <ToggleSwitch
                checked={Boolean(params[param.key])}
                label={param.label}
                hideLabel
                onchange={(on) => setParam(param.key, on)}
              />
            {:else if param.type === 'color'}
              <ColorWheel
                value={String(params[param.key])}
                {swatches}
                onchange={(color) => setParam(param.key, color)}
              />
            {:else}
              <span class="flex shrink-0 items-baseline gap-1">
                <input
                  type="number"
                  class="{numberClass} w-14 px-2 py-1 text-xs"
                  value={Number(params[param.key])}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onchange={(e) => setParam(param.key, Number(e.currentTarget.value))}
                />
                <!-- Never wrapped. Every unit is one or two characters, and a
                     fixed slot narrow enough to keep them tidy was narrow
                     enough to break one across three lines. -->
                <span class="text-[10px] whitespace-nowrap text-gray-500">{param.hint ?? ''}</span>
              </span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
