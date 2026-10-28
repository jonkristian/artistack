<script lang="ts">
  import { Icon, Play, Pause, Backward } from 'svelte-hero-icons';
  import type { ClipPlayback } from '$lib/clips/playback.svelte';

  /**
   * One transport for the clip.
   *
   * It drove whichever video element the pane happened to be showing, and read
   * the time back off it — so the time on display was a render's time, and the
   * clip's only by coincidence. Now the clip has a clock of its own, and this
   * is a button and a reading of it; the pictures follow the same number.
   */
  let {
    clock,
    disabledReason = null,
    ready = true
  }: {
    clock: ClipPlayback;
    /** Why there's nothing to play, said rather than left to be guessed. */
    disabledReason?: string | null;
    /** Whether there's anything on the strip to play at all. */
    ready?: boolean;
  } = $props();

  /**
   * Minutes, seconds and a tenth.
   *
   * Whole seconds made the playhead look wrong. Everything on the strip is
   * labelled in tenths — a block reads 1.8–20.9 — so jumping to a caption that
   * begins at 1.8 and being told you are at 0:01 reads as the caption showing
   * before its time, when the clock is exactly where it was asked to be.
   *
   * A tenth is also what a drag can mean, so this is as fine as the editor
   * ever gets.
   */
  function reading(seconds: number): string {
    const safe = Math.max(0, seconds);
    const minutes = Math.floor(safe / 60);
    const rest = safe - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
  }
</script>

<!-- No padding of its own: this is one group in a row of them, and the row
     spaces its children. Padding here used to add to that gap, so the space
     between the clock and the view switch was twice the space between the
     switch and the button beside it. -->
<div class="flex items-center gap-1.5">
  <!-- Back to the beginning.

       Home and Backspace already do this, and neither of them is on screen.
       Watching a clip is watching it again, so the one move you make most
       often was the one you had to know a shortcut for.

       It leaves playback as it found it: pressing this mid-play restarts the
       clip rather than stopping it, which is what rewinding means. -->
  <button
    type="button"
    onclick={() => clock.seek(0)}
    disabled={!ready || clock.at <= 0}
    title="Back to the start"
    aria-label="Back to the start"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
  >
    <Icon src={Backward} size="16" solid />
  </button>

  <button
    type="button"
    onclick={() => clock.toggle()}
    disabled={!ready}
    title={ready ? (clock.playing ? 'Pause' : 'Play') : (disabledReason ?? 'Nothing to play yet')}
    aria-label={clock.playing ? 'Pause' : 'Play'}
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-gray-50 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Icon src={clock.playing ? Pause : Play} size="16" solid />
  </button>

  <!-- The slash spaced on both sides, with real spaces rather than the ones
       between the tags: those collapse, and the reading came out "0:30.9/
       0:39.9" — the gap on the wrong side of the mark. -->
  <span class="ml-1.5 shrink-0 font-mono text-xs text-gray-400 tabular-nums">
    {reading(clock.at)}<span class="text-gray-500">{'\u00a0/\u00a0'}{reading(clock.duration)}</span>
  </span>
</div>
