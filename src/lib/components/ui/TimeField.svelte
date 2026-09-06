<script lang="ts">
  /**
   * A seconds field that can take its value from a video's playhead.
   *
   * Trim points and caption timings are the two places in the studio where a
   * number has to match a moment in the footage. Typing one meant watching the
   * video somewhere else and counting, or rendering to find out you were a
   * second late — and a render is several ffmpeg passes, so that loop is the
   * most expensive way to answer the cheapest question.
   *
   * The music bed already solved this with a player and a "scrub above to find
   * it" hint. This is the same answer for the fields that had nothing to scrub.
   *
   * Typing still works. Marking is the faster path, not the only one.
   */
  import { fieldGroupClass, bareInputClass } from '$lib/utils/classes';

  interface Props {
    /** Seconds. Null where an empty field means "unset" rather than zero. */
    value: number | null;
    onchange: (value: number | null) => void;
    /** The accessible name — these sit in rows too dense for a visible label. */
    label: string;
    /**
     * The player to mark against, or nothing when there isn't one yet: an
     * unrendered clip has no timeline to point at. The button stays put and
     * explains itself rather than disappearing, so the gesture is still
     * discoverable before it's usable.
     *
     * A media element rather than a video one — all this reads is the
     * playhead, and a music bed's own `<audio>` answers "where in the track"
     * exactly as well as a video answers "where in the clip".
     */
    media?: HTMLMediaElement | null;
    placeholder?: string;
    /** Width classes for the group — `flex-1` where it should fill the row. */
    width?: string;
    /** Why there's no playhead, when there isn't one. */
    unavailable?: string;
  }

  let {
    value,
    onchange,
    label,
    media = null,
    placeholder,
    width = 'w-24',
    unavailable = 'Nothing to mark against yet'
  }: Props = $props();

  let input = $state<HTMLInputElement>();

  /** Tenths: finer than anyone can hit by eye, coarser than a float's noise. */
  function mark() {
    if (!media) return;
    const seconds = Math.round(media.currentTime * 10) / 10;

    /*
     * Written to the element as well as reported. The caller may hold this
     * value behind a save and a reload, and until that lands the field would
     * still show the old number — which reads as the button having missed.
     */
    if (input) input.value = String(seconds);
    onchange(seconds);
  }
</script>

<!-- One control, not two. The mark button lives inside the field's own
     outline, the way an input group does, so it reads as something you do to
     this value rather than a button that happens to sit beside it. -->
<div class="{fieldGroupClass} {width} min-w-0">
  <input
    bind:this={input}
    type="number"
    step="0.1"
    min="0"
    value={value ?? ''}
    {placeholder}
    aria-label={label}
    onblur={(e) => onchange(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
    class={bareInputClass}
  />
  <button
    type="button"
    onclick={mark}
    disabled={!media}
    title={media ? `${label}: set to where the player is now` : unavailable}
    aria-label={media ? `${label}: set to where the player is now` : unavailable}
    class="mr-1 shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-700
           hover:text-white disabled:cursor-not-allowed disabled:opacity-30
           disabled:hover:bg-transparent disabled:hover:text-gray-500"
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M12 4v3m0 10v3M4 12h3m10 0h3M12 8a4 4 0 100 8 4 4 0 000-8z"
      />
    </svg>
  </button>
</div>
