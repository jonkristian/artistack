<script lang="ts">
  /**
   * Which effect a block is, and how hard.
   *
   * The block is twenty-two pixels tall and holds a name. Everything else about
   * an effect lives here, for the same reason the caption dialog exists: a
   * block that size can carry a gesture or a control, not both, and the gesture
   * — where it starts and stops — is the thing the strip says better than any
   * field could.
   *
   * Nothing in here is a second way to do anything. Timing isn't offered,
   * because that is what you just dragged; the picker is the same component the
   * Look panel uses, so an effect's dials are in one place whichever route you
   * took to them.
   */
  import BlockDialog from './BlockDialog.svelte';
  import EffectPicker from './EffectPicker.svelte';
  import { pictureEffectById } from '$lib/clips/effects';
  import type { AppliedEffect, PlacedEffect } from '$lib/clips/types';

  let {
    effect,
    index,
    swatches = [],
    clipId = null,
    onchange,
    onremove,
    onclose
  }: {
    effect: PlacedEffect;
    /** Which one it is, only so the heading can say. */
    index: number;
    swatches?: string[];
    /** So the picker can show the looks on this clip's own footage. */
    clipId?: number | null;
    onchange: (patch: AppliedEffect) => void;
    onremove: () => void;
    onclose: () => void;
  } = $props();

  const label = $derived(pictureEffectById(effect.id)?.label ?? 'Effect');
</script>

<BlockDialog title="{label} · block {index + 1}" {onremove} {onclose}>
  <!-- No None here, unlike the Look panel's copy. Removing the block is how you
       say no effect, and it is one press away at the bottom of this dialog —
       an option that empties a block without removing it would leave a bar on
       the strip standing for nothing. -->
  <EffectPicker
    family="picture"
    value={effect}
    {clipId}
    {swatches}
    onchange={(chosen) => chosen && onchange(chosen)}
  />
</BlockDialog>
