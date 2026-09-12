<script lang="ts">
  /**
   * The whole clip, always, in one row you can drag along.
   *
   * The strip it sits under shows whatever the zoom leaves room for, and at any
   * useful zoom on a four-minute clip that is a small window onto a long thing:
   * getting to a moment meant scrolling and guessing how far. Here the whole
   * edit is one row wide, so a place is somewhere to point at.
   *
   * Not a second timeline. Nothing here can be edited, and the blocks are drawn
   * as bars with no name, no picture and no handles — it says where things are,
   * and the strip says what they are.
   *
   * A component of its own because it is the one part of the timeline that can
   * be: everything it needs arrives as numbers, and the only thing it has to say
   * back is where you pointed.
   */
  import { beginDragGesture } from '$lib/utils/drag';

  interface Bar {
    start: number;
    end: number;
  }

  let {
    /** The clip's full length, which is what the row's width represents. */
    canvas,
    clips,
    captions,
    tracks,
    /** Placed footage effects, so the overview shows the lane that exists. */
    effects = [],
    playhead,
    /** What the strip is showing, in seconds, drawn as a pane of glass. */
    viewFrom,
    viewWidth,
    live = false,
    onscrub
  }: {
    canvas: number;
    clips: Bar[];
    captions: Bar[];
    effects?: Bar[];
    tracks: Bar[];
    playhead: number;
    viewFrom: number;
    viewWidth: number;
    /** True while a gesture is running, so nothing eases under the hand. */
    live?: boolean;
    onscrub: (seconds: number) => void;
  } = $props();

  /** A span as a left/width pair, clamped so nothing hangs off either end. */
  const place = (start: number, end: number) => {
    const from = Math.max(0, Math.min(start, canvas));
    const to = Math.max(from, Math.min(end, canvas));
    // A floor in pixels, not seconds: a share of a six-minute overview makes a
    // short caption a fraction of a pixel, which draws as nothing at all.
    return `left: ${(from / canvas) * 100}%; width: ${((to - from) / canvas) * 100}%; min-width: 2px`;
  };

  function report(e: PointerEvent, el: HTMLElement) {
    const box = el.getBoundingClientRect();
    onscrub(Math.max(0, Math.min(canvas, ((e.clientX - box.left) / box.width) * canvas)));
  }

  function start(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget as HTMLElement;
    const release = beginDragGesture();
    report(e, el);

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Already gone; the listeners below still see the gesture through.
    }

    const move = (ev: PointerEvent) => report(ev, el);
    const finish = () => {
      release();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', finish);
      el.removeEventListener('pointercancel', finish);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }
</script>

<!-- Sideways arrows, not the pointing hand.

     A hand says "this is a thing you click", and clicking is the least of what
     this does: you press it and drag, and the whole bar is the control rather
     than a row of targets on it. Deliberately not the grab hand the strip above
     uses either — that one pans the view, and this moves the playhead. Two
     gestures that look alike and do different things should not also feel
     alike under the cursor. -->
<div
  role="slider"
  tabindex="-1"
  aria-label="Scrub the whole clip"
  aria-valuemin={0}
  aria-valuemax={canvas}
  aria-valuenow={playhead}
  onpointerdown={start}
  class="relative h-10 cursor-ew-resize overflow-hidden border-t border-gray-800 bg-gray-950 select-none"
>
  <!-- Four bands in the same order and colours as the lanes above, so the eye
       carries the meaning down without a legend. Effects went missing when the
       lane was added: an overview that leaves a lane out is one you learn not
       to trust, because the thing you are looking for might simply not be
       drawn. The extra height came from the ruler that used to run through the
       padding above the first lane, which was never a lane at all.

       Positioned in pixels rather than on the spacing scale: four rows in forty
       pixels lands on halves the scale doesn't have, and rounding them apart
       one at a time is how bands stop being evenly spaced. -->
  {#each effects as fx, index (index)}
    <div
      class="pointer-events-none absolute top-[4px] h-1.5 rounded-[1px] bg-white/45"
      style={place(fx.start, fx.end)}
    ></div>
  {/each}
  {#each clips as clip, index (index)}
    <div
      class="pointer-events-none absolute top-[13px] h-2 rounded-[1px] bg-gray-400/80"
      style={place(clip.start, clip.end)}
    ></div>
  {/each}
  {#each captions as caption, index (index)}
    <div
      class="pointer-events-none absolute top-[24px] h-1.5 rounded-[1px] bg-violet-400/80"
      style={place(caption.start, caption.end)}
    ></div>
  {/each}
  {#each tracks as track, index (index)}
    <div
      class="pointer-events-none absolute top-[32px] h-1.5 rounded-[1px] bg-emerald-400/80"
      style={place(track.start, track.end)}
    ></div>
  {/each}

  <!-- What the strip is currently showing. Drawn over everything, as a pane of
       glass rather than a shape: it is a statement about the other view, not a
       thing on this one.

       Clamped to what is left of the row, not just to the row's length. `left`
       and `width` are percentages of the same box, so near the end of a clip
       they added up to more than all of it and the window hung off the right
       edge. -->
  <div
    class="pointer-events-none absolute inset-y-0 rounded-sm border border-white/25 bg-white/10"
    style={place(viewFrom, viewFrom + viewWidth)}
  ></div>

  <!-- Pulled a pixel back off the end, so the marker stays inside the row it is
       marking rather than overhanging it. -->
  <div
    class="pointer-events-none absolute inset-y-0 -ml-px w-px bg-white"
    style="left: {(Math.min(playhead, canvas) / canvas) * 100}%"
  ></div>
</div>
