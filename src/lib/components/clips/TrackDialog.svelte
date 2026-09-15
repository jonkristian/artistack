<script lang="ts">
  /**
   * What a shot or a bed can be told, when its block is too small to tell it.
   *
   * One component for both because they are the same kind of thing on the
   * strip — a stretch of a file, playing from somewhere in it — and the two
   * lists barely differ: a shot can be silenced, a bed can be faded at either
   * end and pushed under a voice. Two files to say that would be two files to
   * keep in step.
   *
   * Only what the buttons on the block do, and in their order. Where it starts
   * and stops stays on the strip, which says it better than a pair of fields.
   */
  import BlockDialog from './BlockDialog.svelte';

  interface Props {
    /** Which lane it came from, since that decides what there is to say. */
    kind: 'clip' | 'audio';
    label: string;
    /** A shot's own sound, off. Beds don't have one. */
    muted?: boolean;
    /** A held picture: no sound of its own, so nothing to keep or silence. */
    still?: boolean;
    /** How this shot fills the frame, or null while it follows the clip. */
    fit?: 'crop' | 'black' | 'blur' | null;
    /** How far into the picture the shot sits, on top of the fill. */
    zoom?: number;
    /** Whether it drifts across what the fill crops away. */
    pan?: boolean;
    fadeIn?: boolean;
    fadeOut?: boolean;
    /** A bed sitting back under speech. */
    duck?: boolean;
    onmute?: (muted: boolean) => void;
    onfit?: (fit: 'crop' | 'black' | 'blur' | null) => void;
    onframing?: (patch: { zoom?: number; pan?: boolean }) => void;
    onaudio?: (patch: { fadeIn?: boolean; fadeOut?: boolean; duck?: boolean }) => void;
    onremove: () => void;
    onclose: () => void;
  }

  let {
    kind,
    label,
    muted = false,
    still = false,
    fit = null,
    zoom = 1,
    pan = false,
    fadeIn = true,
    fadeOut = true,
    duck = false,
    onmute,
    onfit,
    onframing,
    onaudio,
    onremove,
    onclose
  }: Props = $props();

  /**
   * Switches rather than a grid of buttons.
   *
   * Everything here is on or off, which a caption's settings mostly aren't —
   * so this reads as a short list of statements about the block, and the eye
   * can run down the right-hand edge to see what's on.
   */
  const rows = $derived(
    kind === 'clip'
      ? [
          /*
           * The same two switches the block itself carries, so the dialog is
           * the narrow-block spelling of the inline tools rather than a second
           * set of settings that happen to overlap.
           */
          ...(onfit
            ? [
                {
                  key: 'fit',
                  label: 'Fill the frame',
                  hint: "Crop it to the clip's shape instead of fitting it whole.",
                  on: fit === 'crop',
                  set: (next: boolean) => onfit?.(next ? 'crop' : null)
                }
              ]
            : []),
          ...(onframing
            ? [
                {
                  key: 'pan',
                  label: 'Let it drift',
                  hint: 'Move slowly across whatever falls outside the frame. Needs something outside it — fill the frame, or zoom in.',
                  on: pan,
                  set: (next: boolean) => onframing?.({ pan: next })
                }
              ]
            : []),
          // A still never had sound to keep, so it isn't offered the switch.
          ...(still
            ? []
            : [
                {
                  key: 'muted',
                  label: 'Keep its own sound',
                  hint: 'Off means the beds are the only thing you hear over this shot.',
                  on: !muted,
                  set: (next: boolean) => onmute?.(!next)
                }
              ])
        ]
      : [
          {
            key: 'fadeIn',
            label: 'Fade in',
            hint: 'Come up at its own start rather than arriving at full.',
            on: fadeIn,
            set: (next: boolean) => onaudio?.({ fadeIn: next })
          },
          {
            key: 'fadeOut',
            label: 'Fade out',
            hint: 'Go away at its own end rather than stopping dead.',
            on: fadeOut,
            set: (next: boolean) => onaudio?.({ fadeOut: next })
          },
          {
            key: 'duck',
            label: 'Duck under speech',
            hint: 'Sit back whenever the footage has something to say.',
            on: duck,
            set: (next: boolean) => onaudio?.({ duck: next })
          }
        ]
  );
</script>

<BlockDialog title={label} removeLabel="Take off timeline" {onremove} {onclose}>
  <div class="space-y-1">
    {#if rows.length === 0 && still}
      <p class="px-2 py-2 text-xs text-gray-400">
        A still has no sound and no footage to trim — drag its edge to change how long it is held.
      </p>
    {/if}
    {#if onframing}
      <!-- A number rather than a switch, and the only reason this dialog is
           reachable from a wide block at all: how far in the shot sits, which
           is also what makes room for a drift on a picture that already fits. -->
      <div class="flex items-center gap-3 px-2 py-2">
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-white">How far in</span>
          <span class="block text-xs text-gray-400">
            Above 1 the frame shows less of it, and there is more to drift through.
          </span>
        </span>
        <input
          type="number"
          value={zoom}
          min="1"
          max="3"
          step="0.05"
          onchange={(e) => onframing?.({ zoom: Number(e.currentTarget.value) })}
          class="w-20 shrink-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white"
        />
      </div>
    {/if}
    {#each rows as row (row.key)}
      <label
        class="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-800/60"
      >
        <input
          type="checkbox"
          checked={row.on}
          onchange={(e) => row.set(e.currentTarget.checked)}
          class="mt-0.5 rounded border-gray-600 bg-gray-700 text-violet-500"
        />
        <span>
          <span class="block text-sm font-medium text-white">{row.label}</span>
          <span class="block text-xs text-gray-400">{row.hint}</span>
        </span>
      </label>
    {/each}
  </div>
</BlockDialog>
