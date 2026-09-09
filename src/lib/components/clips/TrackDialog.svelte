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
    fadeIn?: boolean;
    fadeOut?: boolean;
    /** A bed sitting back under speech. */
    duck?: boolean;
    onmute?: (muted: boolean) => void;
    onaudio?: (patch: { fadeIn?: boolean; fadeOut?: boolean; duck?: boolean }) => void;
    onremove: () => void;
    onclose: () => void;
  }

  let {
    kind,
    label,
    muted = false,
    fadeIn = true,
    fadeOut = true,
    duck = false,
    onmute,
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
          {
            key: 'muted',
            label: 'Keep its own sound',
            hint: 'Off means the beds are the only thing you hear over this shot.',
            on: !muted,
            set: (next: boolean) => onmute?.(!next)
          }
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
