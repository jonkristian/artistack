<script lang="ts">
  import { Icon, Play, Pause } from 'svelte-hero-icons';

  /**
   * One transport for whatever is in the pane.
   *
   * The pane shows four different things over a clip's life — the full render,
   * the quick preview, a single shot borrowed from the strip, and the stand-in
   * when there's one shot and nothing rendered — and each carried the browser's
   * own controls. Four transports, in four places, none of them next to the
   * strip they scrub against.
   *
   * So: one bar above the timeline, driving whichever player is live. It reads
   * the element rather than being told what it's doing, because the element is
   * the one thing that knows — a play that fails, a seek that lands somewhere
   * else, a file that ends all arrive here as events.
   */
  let {
    player,
    disabledReason = null,
    scrub = false
  }: {
    /** The live player, or nothing when there's nothing to play yet. */
    player?: HTMLMediaElement;
    /** Why there's nothing to play, said rather than left to be guessed. */
    disabledReason?: string | null;
    /**
     * Whether to offer a scrub bar.
     *
     * Off by default, because the strip is the scrubber: it is the clip's own
     * time axis and pressing it moves the playhead. On for a shot borrowed into
     * the pane, where the picture is one file and the strip is measuring
     * something else — the one case where this is the only control that can.
     */
    scrub?: boolean;
  } = $props();

  let at = $state(0);
  let duration = $state(0);
  let playing = $state(false);

  /*
   * Listeners on the element, replaced whenever it changes. A new file in the
   * same element fires `loadedmetadata` again, so the length follows a
   * different shot without the component being told.
   */
  $effect(() => {
    const live = player;
    if (!live) {
      at = 0;
      duration = 0;
      playing = false;
      return;
    }

    const sync = () => {
      at = live.currentTime;
      // Infinity until a stream knows its own length; 0 reads as "no idea",
      // which is what the bar should show rather than a wrong number.
      duration = Number.isFinite(live.duration) ? live.duration : 0;
      playing = !live.paused && !live.ended;
    };

    sync();
    const events = [
      'timeupdate',
      'durationchange',
      'loadedmetadata',
      'play',
      'pause',
      'ended',
      'seeked'
    ];
    for (const event of events) live.addEventListener(event, sync);
    return () => {
      for (const event of events) live.removeEventListener(event, sync);
    };
  });

  function toggle() {
    if (!player) return;
    if (player.paused) void player.play().catch(() => {});
    else player.pause();
  }

  function seek(seconds: number) {
    if (player) player.currentTime = seconds;
  }

  /** Minutes and seconds, which is every clip this is ever used on. */
  function clock(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
</script>

<div class="flex items-center gap-3 px-2 py-1.5">
  <button
    type="button"
    onclick={toggle}
    disabled={!player}
    title={player ? (playing ? 'Pause' : 'Play') : (disabledReason ?? 'Nothing to play yet')}
    aria-label={playing ? 'Pause' : 'Play'}
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Icon src={playing ? Pause : Play} size="16" solid />
  </button>

  {#if scrub}
    <input
      type="range"
      min="0"
      max={duration || 0}
      step="0.05"
      value={at}
      disabled={!player || !duration}
      aria-label="Scrub"
      class="h-1 min-w-0 flex-1 accent-violet-500 disabled:opacity-40"
      oninput={(e) => seek(Number(e.currentTarget.value))}
    />
  {:else}
    <span class="min-w-0 flex-1"></span>
  {/if}

  <span class="shrink-0 font-mono text-xs text-gray-400 tabular-nums">
    {clock(at)}<span class="text-gray-600"> / {clock(duration)}</span>
  </span>
</div>
