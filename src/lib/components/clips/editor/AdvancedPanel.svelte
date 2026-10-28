<script lang="ts">
  /**
   * The numbers behind everything else: the encoder, the audio timings, the
   * caption maths, the sizes a mark is drawn at.
   *
   * Moved out of the clip page unchanged. It writes nothing itself — the page
   * owns every save — and it knows only the two views of the config it draws
   * from: what the server last agreed to, and that merged with whatever is
   * being typed right now.
   */
  import RenderDial from './RenderDial.svelte';
  import { fieldClass, labelClass, groupTitleClass } from '$lib/utils/classes';
  import { ADVANCED_GROUPS, DEFAULT_ADVANCED_CONFIG } from '$lib/clips/types';
  import type { ClipAdvancedConfig } from '$lib/clips/types';

  let {
    advanced,
    savedAdvanced,
    onfield,
    ondraft,
    onreset,
    onpreset
  }: {
    /** The config as it reads now, drafts included. */
    advanced: ClipAdvancedConfig;
    /** The config as the server last agreed to it. */
    savedAdvanced: ClipAdvancedConfig;
    /** A field left, with the value to save. False if the server kept the old one. */
    onfield: (key: keyof ClipAdvancedConfig, value: number) => Promise<boolean>;
    /** A keystroke, so the preview can follow before the save lands. */
    ondraft: (key: keyof ClipAdvancedConfig, value: number) => void;
    onreset: () => void;
    /** The encoder speed, which is a word rather than a number. */
    onpreset: (value: string) => void;
  } = $props();
</script>

<!-- The numbers behind everything else.

                 It was a disclosure inside Customise inside Effects —
                 three doors deep, and none of its contents are effects:
                 branding placement, audio timings, caption maths, the
                 encoder. A rail entry of its own, at the foot of the rail
                 below the five steps of the job, because this is the
                 drawer rather than a step. The dot says something in here
                 has been moved off its default. -->
<!-- No inset: this used to be a card, where the padding held its
           contents off its own edge. Inside another card it just
           stepped the fields in from everything above them. -->
<div class="mt-4 space-y-6">
  <!-- One per row. Three across a rail this narrow left each of
                   them about eleven characters wide: "Encoder speed" wrapped
                   onto two lines, "Font family" cut its own placeholder off
                   mid-word, and the colour swatch was the only one that fit
                   because it has nothing to say. -->
  <div class="grid [grid-template-columns:minmax(0,1fr)] gap-4">
    <div>
      <label class={labelClass} for="adv-preset">Encoder speed</label>
      <select
        id="adv-preset"
        class={fieldClass}
        value={advanced.preset}
        onchange={(e) => onpreset(e.currentTarget.value)}
      >
        {#each ['ultrafast', 'veryfast', 'faster', 'fast', 'medium', 'slow'] as p (p)}
          <option value={p}>{p}</option>
        {/each}
      </select>
    </div>
  </div>

  {#each ADVANCED_GROUPS as group (group.label)}
    <div>
      <h3 class={groupTitleClass}>
        {group.label}
      </h3>
      <!-- A settings list, not a form: the name on the left, the
                       number on the right, one per line. Two columns of
                       twelve rems in a rail this narrow wrapped half the
                       labels onto three lines around a box holding "30",
                       and reading down a column of names is how you find
                       the one you came for. -->
      <div class="divide-y divide-gray-800/70 border-y border-gray-800/70">
        {#each group.fields as field (field.key)}
          <RenderDial
            {field}
            saved={savedAdvanced[field.key] as number}
            changed={advanced[field.key] !== DEFAULT_ADVANCED_CONFIG[field.key]}
            oninput={(value) => ondraft(field.key, value)}
            onsave={(value) => onfield(field.key, value)}
          />
        {/each}
      </div>
    </div>
  {/each}

  <button
    type="button"
    onclick={onreset}
    class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
  >
    Reset all to defaults
  </button>
</div>
