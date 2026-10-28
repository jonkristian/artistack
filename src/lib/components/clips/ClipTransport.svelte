<script lang="ts">
  import { Icon, Play, Pause } from 'svelte-hero-icons';
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

<div class="flex items-center gap-3 px-2 py-1.5">
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

  <span class="shrink-0 font-mono text-xs text-gray-400 tabular-nums">
    {reading(clock.at)}<span class="text-gray-500"> / {reading(clock.duration)}</span>
  </span>
</div>
