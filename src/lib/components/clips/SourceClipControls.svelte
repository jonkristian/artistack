<script lang="ts">
  /**
   * Trim, mute and rotate for one source clip, opened underneath its row.
   *
   * These were a dialog until the timeline moved into the page footer, at which
   * point a modal covered the one thing you might want to watch while adjusting
   * a clip. Inline, the strip stays visible and the row stays in its list.
   *
   * Each change saves as it's made, like everything else in the admin. The
   * dialog had to save on the way out instead — closing with Escape never
   * blurred the field you were typing in — and losing that constraint is the
   * other half of why this is simpler than what it replaces.
   *
   * The player is here rather than in the row because it's the only reason the
   * trim fields can be marked rather than guessed at, and because only the open
   * row mounts one: a list of five sources should not be five video elements.
   */
  import { labelClass } from '$lib/utils/classes';
  import { ToggleSwitch, TimeField } from '$lib/components/ui';
  import type { ClipRotation } from '$lib/clips/types';

  interface Props {
    /** The source file, so the trim points can be found by watching it. */
    src?: string | null;
    trimStart: number | null;
    trimEnd: number | null;
    muted: boolean;
    rotation: ClipRotation;
    onchange: (values: {
      trimStart?: number | null;
      trimEnd?: number | null;
      muted?: boolean;
      rotation?: ClipRotation;
    }) => void;
  }

  let { src = null, trimStart, trimEnd, muted, rotation, onchange }: Props = $props();

  /** The player the trim points are marked against. */
  let video = $state<HTMLVideoElement>();

  /**
   * The preview turns with the setting, in CSS, so the answer to "is this the
   * right way up now" arrives before the render rather than after it.
   *
   * A quarter turn leaves the element's own box unturned — it still reserves
   * the width and height of the unrotated video — so the turned picture is
   * capped in both directions to fit. Hence the two cases: a portrait clip laid
   * on its side is far wider than it is tall, and left alone it would spill out
   * of the row.
   */
  const quarter = $derived(rotation === 90 || rotation === 270);

  // The cast is the arithmetic's fault, not a loosening: a quarter turn on one
  // of four right angles is always another one, and TypeScript can't see that
  // through `%`.
  const rotate = () => onchange({ rotation: ((rotation + 90) % 360) as ClipRotation });
</script>

<!-- No background or corners of its own: the row it opens under carries
     those, so the two read as one object rather than a card that appeared
     underneath another one. Only a rule to divide them. -->
<div class="space-y-3 border-t border-gray-700/60 px-3 pt-3 pb-3">
  {#if src}
    <!-- Fixed height so the box doesn't resize under you as the picture turns
         inside it. -->
    <div class="flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-black">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={video}
        {src}
        controls
        preload="metadata"
        class={quarter ? 'max-h-48 max-w-48' : 'max-h-full max-w-full'}
        style="transform: rotate({rotation}deg)"
      ></video>
    </div>
  {/if}

  <div class="flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-1">
      <span class={labelClass}>From (s)</span>
      <TimeField
        value={trimStart}
        onchange={(v) => onchange({ trimStart: v })}
        label="Trim from"
        media={video}
        width="flex-1"
        unavailable="This source has no file to play"
      />
    </div>
    <div class="min-w-0 flex-1">
      <span class={labelClass}>To (s)</span>
      <TimeField
        value={trimEnd}
        onchange={(v) => onchange({ trimEnd: v })}
        label="Trim to"
        media={video}
        width="flex-1"
        unavailable="This source has no file to play"
      />
    </div>
  </div>
  <p class="text-xs text-gray-600">
    Leave empty to use the whole clip. Scrub the video and mark the point rather than typing it.
  </p>

  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-800 pt-3">
    <ToggleSwitch
      label="Mute this clip"
      size="md"
      checked={muted}
      onchange={(v) => onchange({ muted: v })}
    />
    <button
      type="button"
      onclick={rotate}
      class="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"
        />
      </svg>
      Rotate
    </button>
    <span class="text-xs text-gray-500">
      {rotation === 0 ? 'As it came' : `Turned ${rotation}°`}
    </span>
  </div>
</div>
