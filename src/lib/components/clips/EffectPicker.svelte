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

  const choice =
    'rounded-lg border px-3 py-1.5 text-sm transition-colors border-gray-700 text-gray-300 hover:bg-gray-800';
  const picked = 'rounded-lg border px-3 py-1.5 text-sm border-violet-500 bg-violet-600 text-white';
</script>

<div class="space-y-3">
  <!-- Present when there is something for "nothing" to mean: a caption handing
       the choice back to the clip, or footage left alone. A clip's own caption
       effect has neither — an unset one is the plain fade, which is in the list
       already, so a second way to say the same thing would only confuse. -->
  {#if canInherit || family === 'picture'}
    <button type="button" onclick={() => onchange(null)} class={value ? choice : picked}>
      {canInherit ? `Auto (${inheritedLabel})` : 'None'}
    </button>
  {/if}

  {#each groups as group (group.id)}
    <div>
      <!-- The pack name only earns its space once there is more than one; with
           a single pack it is a heading over the entire list. -->
      {#if groups.length > 1}
        <span class="text-xs font-medium tracking-wide text-gray-500 uppercase">{group.label}</span>
      {/if}
      <div class="mt-1 flex flex-wrap gap-2">
        {#each group.effects as effect (effect.id)}
          <button
            type="button"
            title={effect.description}
            onclick={() => onchange({ id: effect.id })}
            class={showSwatches
              ? `overflow-hidden rounded-lg border text-left transition-colors ${
                  chosen?.id === effect.id
                    ? 'border-violet-500'
                    : 'border-gray-700 hover:border-gray-500'
                }`
              : chosen?.id === effect.id
                ? picked
                : choice}
          >
            {#if showSwatches}
              <!-- A frame of this clip's own footage with the look on it.

                   `previewFilters` drops anything that needs motion, so an
                   effect with nothing to show in a still — Signal loss — has no
                   swatch and the route says so; the image simply fails to load
                   and the name underneath still names it. -->
              <img
                src="/admin/clips/{clipId}/effect/{effect.id}"
                alt=""
                loading="lazy"
                class="aspect-[4/3] w-24 bg-gray-950 object-cover"
              />
              <span class="block px-2 py-1.5 text-xs text-gray-300">{effect.label}</span>
            {:else}
              {effect.label}
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/each}

  {#if chosen}
    <p class="text-xs text-gray-500">{chosen.description}</p>
  {/if}

  <!-- The dials, drawn from what the effect says it has. -->
  {#if chosen?.params?.length}
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-gray-800 pt-3">
      {#each chosen.params as param (param.key)}
        <div>
          <span class="mb-1 block text-xs text-gray-400">{param.label}</span>
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
            <span class="flex items-baseline gap-1.5">
              <input
                type="number"
                class="{numberClass} w-20"
                value={Number(params[param.key])}
                min={param.min}
                max={param.max}
                step={param.step}
                onchange={(e) => setParam(param.key, Number(e.currentTarget.value))}
              />
              {#if param.hint}<span class="text-xs text-gray-500">{param.hint}</span>{/if}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
