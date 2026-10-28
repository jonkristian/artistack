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
  import { Icon, Cog6Tooth } from 'svelte-hero-icons';
  import { ColorWheel, ToggleSwitch } from '$lib/components/ui';
  import {
    PACKS,
    effectById,
    pictureEffectById,
    effectParams,
    isLookEffect
  } from '$lib/clips/effects';
  import type { PictureEffect } from '$lib/clips/effects';
  import { numberClass } from '$lib/utils/classes';
  import { dismissable } from '$lib/utils/dialog';
  import { untrack } from 'svelte';
  import type { AppliedEffect } from '$lib/clips/types';

  let {
    value,
    inherited = null,
    canInherit = false,
    family = 'caption',
    swatches = [],
    clipId = null,
    scope = 'look',
    onchange,
    onpick
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
    /**
     * Which picture effects this is choosing between.
     *
     * `look` is what a shot or a clip can be *in* — a grade, a tape, a
     * texture. `placed` is everything, including the ones that are events: a
     * push in, a dropout. Asking a whole shot to be a push in is not something
     * anyone means, so the shot's picker doesn't offer it; the strip does,
     * where an event can be put at the moment it happens.
     */
    scope?: 'look' | 'placed';
    /**
     * A tile was pressed.
     *
     * Separate from `onchange`, which also fires for a dial being turned —
     * every dial sends the whole effect back, so "the effect changed" cannot
     * tell choosing from adjusting. Whoever wants to show what an effect does
     * wants this one, and only this one.
     */
    onpick?: (effect: AppliedEffect | null) => void;
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
      effects: ((family === 'caption' ? pack.captions : pack.picture) ?? []).filter((effect) =>
        family === 'picture' && scope === 'look' ? isLookEffect(effect as PictureEffect) : true
      )
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

  /** Whether the chosen effect's dials are out. */
  let dialsOpen = $state(false);
  let dialsEl = $state<HTMLDialogElement>();

  $effect(() => {
    if (dialsOpen) dialsEl?.showModal();
  });

  /* Choosing a different effect closes dials that belonged to the last one. */
  $effect(() => {
    void applied?.id;
    untrack(() => (dialsOpen = false));
  });
  /*
   * What "Auto" defers to, in the right family.
   *
   * It asked the caption registry whichever family it was in, and that one
   * falls back to Fade — so a shot set to follow a clip with no look of its
   * own offered "Auto (Fade)", naming a caption entrance as the thing a
   * picture would do.
   */
  const inheritedLabel = $derived(
    family === 'picture'
      ? (pictureEffectById(inherited?.id)?.label ?? 'None')
      : effectById(inherited?.id).label
  );

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
<!-- One column, and the dials under the tiles rather than beside them.
     This used to split in two at `sm` and the tiles went to four across at
     `lg` — both measured against the *window*, which stopped meaning anything
     the moment this moved into a panel a fifth of the window wide. On a wide
     screen it drew four tiles in three hundred pixels and every label came out
     as a letter and an ellipsis. -->
<div class="grid gap-4">
  <!-- Two to a line. A tile is a picture and a name, and a name that doesn't
       fit is not a name. `items-start`, or each one stretches to its row's
       height. -->
  <!-- One per row. Two across left a name and a sentence sharing about a
       hundred and forty pixels, which is a column of hyphenated words; a row
       gives the swatch its shape and the words the rest. -->
  <div class="grid min-w-0 grid-cols-1 items-start gap-2">
    {#if canInherit || family === 'picture'}
      <!-- The one that is not an effect, in the same row shape as the ones
           that are: it was a tall blank tile with a name and nothing to say,
           which made the first thing in the list the odd thing in the list. -->
      <button
        type="button"
        onclick={() => {
          onchange(null);
          onpick?.(null);
        }}
        class="flex w-full items-stretch gap-2 overflow-hidden rounded-lg border text-left transition-colors {value
          ? 'border-gray-700 hover:border-gray-500'
          : 'border-violet-500'}"
      >
        {#if showSwatches}
          <span
            class="flex aspect-[4/3] w-24 shrink-0 items-center justify-center bg-gray-950 text-[10px] text-gray-500"
          >
            none
          </span>
        {/if}
        <span class="block min-w-0 flex-1 px-2 py-1.5 text-left">
          <span class="block truncate text-xs text-gray-300">
            {canInherit ? `Auto (${inheritedLabel})` : 'None'}
          </span>
          <span class="mt-0.5 block text-[10px] leading-snug text-gray-500">
            {canInherit
              ? `Whatever the clip says, which is ${inheritedLabel.toLowerCase()}.`
              : 'Leave the footage alone.'}
          </span>
        </span>
      </button>
    {/if}

    {#each groups as group (group.id)}
      {#each group.effects as effect (effect.id)}
        {@const picked = chosen?.id === effect.id}
        <div class="relative self-start">
          <!-- The dials belong to the one that is chosen, so they are reached
               from it: a cog on the tile rather than a block of controls under
               the grid, which was there whether or not anyone wanted it and
               made a short list of looks read as a long panel of settings. -->
          {#if picked && chosen?.params?.length}
            <button
              type="button"
              onclick={() => (dialsOpen = true)}
              title="{chosen.label} settings"
              aria-label="{chosen.label} settings"
              class="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gray-950/80 text-gray-300 transition-colors hover:bg-gray-800 hover:text-gray-50"
            >
              <Icon src={Cog6Tooth} size="14" solid />
            </button>
          {/if}
          <button
            type="button"
            title={effect.description}
            onclick={() => {
              onchange({ id: effect.id });
              onpick?.({ id: effect.id });
            }}
            class="flex w-full items-stretch gap-2 overflow-hidden rounded-lg border text-left transition-colors {picked
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
                  class="aspect-[4/3] w-24 shrink-0 bg-gray-950 object-cover"
                />
              {:else}
                <span
                  class="flex aspect-[4/3] w-24 shrink-0 items-center justify-center bg-gray-950 text-[10px] text-gray-500"
                >
                  moves
                </span>
              {/if}
            {/if}
            <span class="block min-w-0 flex-1 px-2 py-1.5 text-left">
              <span class="block truncate text-xs text-gray-300">{effect.label}</span>
              <!-- What it does, on the thing it does it to. It was one line
                   under the whole grid describing whichever tile happened to
                   be chosen — a caption for a picture you had to remember you
                   were looking at. -->
              <span class="mt-0.5 block text-[10px] leading-snug text-gray-500">
                {effect.description}
              </span>
            </span>
          </button>
        </div>
      {/each}
    {/each}
  </div>
</div>

<!-- The dials, when they are asked for. A modal rather than a panel section:
     they belong to one effect, they are read once while setting it up, and in
     the column they pushed everything else off the bottom of the screen. -->
{#if dialsOpen && chosen?.params?.length}
  <dialog
    bind:this={dialsEl}
    use:dismissable
    class="fixed inset-0 m-auto h-fit w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-0 text-gray-50 backdrop:bg-black/60"
    onclose={() => (dialsOpen = false)}
  >
    <div class="space-y-4 p-6">
      <div>
        <h2 class="text-lg font-semibold">{chosen.label}</h2>
        <p class="mt-1 text-xs text-gray-400">{chosen.description}</p>
      </div>

      <div class="grid min-w-0 grid-cols-1 gap-x-3 gap-y-1.5">
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
      </div>

      <div class="flex justify-end border-t border-gray-800 pt-4">
        <button
          type="button"
          onclick={() => dialsEl?.close()}
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
        >
          Done
        </button>
      </div>
    </div>
  </dialog>
{/if}
