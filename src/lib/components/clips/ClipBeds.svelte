<script lang="ts" module>
  /** A bed as the player needs it: a song, when it comes in, and where from. */
  export interface StageBed {
    id: number;
    url: string;
    /** When it comes in, and when it stops; null means "until the clip does". */
    start: number;
    end: number | null;
    /** Where in the song its in-point is. */
    seek: number;
    fadeIn: boolean;
    fadeOut: boolean;
    duck: boolean;
    /** The song's own length, so a short bed can repeat under a long clip. */
    length: number;
  }
</script>

<script lang="ts">
  import { monitor } from '$lib/clips/monitor.svelte';
  import { bedLevel, placeBeds, DUCK_GLIDE, DUCK_UNDER } from '$lib/clips/audio';
  import type { ClipPlayback } from '$lib/clips/playback.svelte';

  /**
   * The score, playing with the clip.
   *
   * A bed was silent in the editor until a render existed — which is a strange
   * thing for the part of the clip you are most likely to be timing a cut
   * against. One element per bed, all of them slaved to the same clock as the
   * picture, so what you hear is where the strip says it is.
   *
   * No visible controls, deliberately: the transport plays the clip, and a
   * second set of buttons for the music would be an invitation to line it up
   * against a picture that wasn't moving.
   */
  let {
    beds,
    clock,
    volume,
    fadeSeconds,
    footageAudible = false
  }: {
    beds: StageBed[];
    clock: ClipPlayback;
    /** What a bed sits at when nothing is pulling it down. */
    volume: number;
    /** A bed's own fade, before an overlap overrides it. */
    fadeSeconds: number;
    /**
     * Whether a shot is making a sound right now, which is what a ducked bed
     * gets out of the way of. The render sidechains off the footage itself;
     * this is the same decision, taken a shot at a time.
     */
    footageAudible?: boolean;
  } = $props();

  const placed = $derived(placeBeds(beds, clock.duration));

  let els = $state<Record<number, HTMLAudioElement | undefined>>({});
  /** Where the duck has glided to, so it arrives and lets go rather than steps. */
  let under = $state(1);

  $effect(() => {
    const wanted = footageAudible ? DUCK_UNDER : 1;
    // Read on every tick, so the glide advances with the clock rather than
    // needing a timer of its own.
    void clock.at;
    under = under + (wanted - under) * DUCK_GLIDE;
  });

  $effect(() => {
    const at = clock.at;
    const running = clock.playing;
    const glide = under;

    placed.forEach((bed, index) => {
      const el = els[bed.track.id];
      if (!el) return;

      const inside = at >= bed.start && at < bed.stop;
      if (!inside) {
        if (!el.paused) el.pause();
        return;
      }

      /*
       * Where in the song we are. Wrapped, because a bed shorter than the
       * stretch it covers repeats — the render loops every bed on the way in,
       * so a thirty-second loop under a ninety-second clip plays three times
       * there and would play once here.
       */
      const length = bed.track.length > 0 ? bed.track.length : Infinity;
      const into = bed.track.seek + (at - bed.start);
      const want = Number.isFinite(length) ? into % length : into;

      // Scaled by the room's level, the way the shots are: one slider for
      // everything the editor plays.
      el.volume =
        monitor.level *
        Math.min(1, Math.max(0, bedLevel(placed, index, fadeSeconds, at) * volume * glide));

      if (running) {
        // Looser than the picture: a frame either way is visible, a fiftieth of
        // a second of music is not, and seeking an audio element mid-phrase is.
        if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
        if (el.paused) void el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
      }
    });
  });
</script>

{#each beds as bed (bed.id)}
  <audio bind:this={els[bed.id]} src={bed.url} preload="auto" class="hidden"></audio>
{/each}
