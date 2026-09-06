<script lang="ts">
  /**
   * Everything about one bed that the timeline can't say, opened underneath its
   * row.
   *
   * The timeline owns where a bed starts and stops — you drag it — so those are
   * here only because the timeline doesn't exist until a clip has been rendered
   * once, and a bed added before then still has to be placeable. Everything
   * else lives here because it has nowhere else it could: which part of the
   * song plays, and how the bed behaves against the footage.
   *
   * Inline rather than a dialog, so the strip stays visible while you adjust
   * the thing sitting on it. Each change saves as it's made.
   */
  import { labelClass } from '$lib/utils/classes';
  import { ToggleSwitch, TimeField } from '$lib/components/ui';

  interface Props {
    /** The track itself, so "where in the song" can be found by ear. */
    src?: string | null;
    /**
     * The rendered clip, for marking where the bed comes in against the thing
     * it comes in over. Absent until there's a render.
     */
    clipVideo?: HTMLMediaElement | null;
    start: number;
    end: number | null;
    seek: number;
    fadeIn: boolean;
    fadeOut: boolean;
    duck: boolean;
    onchange: (values: {
      start?: number;
      end?: number | null;
      seek?: number;
      fadeIn?: boolean;
      fadeOut?: boolean;
      duck?: boolean;
    }) => void;
  }

  let {
    src = null,
    clipVideo = null,
    start,
    end,
    seek,
    fadeIn,
    fadeOut,
    duck,
    onchange
  }: Props = $props();

  /** The track's own player, which answers "where in the song". */
  let audio = $state<HTMLAudioElement>();
</script>

<!-- No background or corners of its own: the row it opens under carries
     those, so the two read as one object rather than a card that appeared
     underneath another one. Only a rule to divide them. -->
<div class="space-y-3 border-t border-gray-700/60 px-3 pt-3 pb-3">
  {#if src}
    <!-- Native controls: scrubbing to find a sync point is exactly what the
         browser's player already does well. -->
    <audio bind:this={audio} {src} controls preload="metadata" class="h-9 w-full"></audio>
  {/if}

  <!-- Three positions, each marked against whatever can answer it: the clip for
       when the bed comes in and stops, the track itself for where it plays
       from. -->
  <div class="flex flex-wrap items-end gap-3">
    <div class="min-w-0 flex-1">
      <span class={labelClass}>Comes in at (s)</span>
      <TimeField
        value={start}
        onchange={(v) => onchange({ start: v ?? 0 })}
        label="Comes in at"
        media={clipVideo}
        width="flex-1"
        unavailable="Render the clip to mark this against it"
      />
    </div>
    <div class="min-w-0 flex-1">
      <span class={labelClass}>Ends at (s)</span>
      <TimeField
        value={end}
        onchange={(v) => onchange({ end: v })}
        label="Ends at"
        media={clipVideo}
        width="flex-1"
        placeholder="end"
        unavailable="Render the clip to mark this against it"
      />
    </div>
    <div class="min-w-0 flex-1">
      <span class={labelClass}>Plays from (s)</span>
      <TimeField
        value={seek}
        onchange={(v) => onchange({ seek: v ?? 0 })}
        label="Plays from"
        media={audio}
        width="flex-1"
        unavailable="This track has no file to play"
      />
    </div>
  </div>
  <p class="text-xs text-gray-600">
    Where it sits in the video, and where in the song it plays from. Drag it on the timeline
    instead, once there's a render to drag it over.
  </p>

  <!-- Whether, not how long: the fade length is one dial in Advanced for the
       whole clip. There is no crossfade setting either — overlap two beds on
       the timeline and the overlap is the crossfade. -->
  <div class="flex flex-wrap gap-x-6 gap-y-3 border-t border-gray-800 pt-3">
    <ToggleSwitch
      label="Fade in"
      size="md"
      checked={fadeIn}
      onchange={(v) => onchange({ fadeIn: v })}
    />
    <ToggleSwitch
      label="Fade out"
      size="md"
      checked={fadeOut}
      onchange={(v) => onchange({ fadeOut: v })}
    />
    <ToggleSwitch
      label="Duck under speech"
      size="md"
      checked={duck}
      onchange={(v) => onchange({ duck: v })}
    />
  </div>
</div>
