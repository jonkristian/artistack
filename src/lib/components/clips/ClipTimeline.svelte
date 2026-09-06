<script lang="ts">
  /**
   * The rendered clip end to end, with everything laid over it that isn't in
   * the footage — the timed captions, and the music under them.
   *
   * This exists because timing was the one thing in the studio you could only
   * find out by rendering. Marking a caption against the preview player closed
   * half of that; the other half is *seeing* the shape of the edit — which
   * lines overlap, where the gap is, whether the bed starts before or after the
   * line it's meant to sit under. A column of numbers can't show a shape.
   *
   * Only ever shown once there's a render. Before one there is no timeline: the
   * duration isn't known, the frames don't exist, and a strip drawn from the
   * sources' own lengths would be a guess presented as a measurement.
   *
   * Nothing here is new state. Every drag lands on the same values the fields
   * above already write, so this is a second way to say the same thing rather
   * than a second copy of it.
   */
  import { beginDragGesture } from '$lib/utils/drag';
  import { STRIP_PX_PER_SECOND } from '$lib/clips/strip';
  import type { ClipAudioTrack, TimedCaption } from '$lib/clips/types';

  /**
   * A bed plus the name to write on it.
   *
   * The name is resolved by the caller rather than looked up here: the timeline
   * is handed what to draw, and giving it the media library to search through
   * would be handing it a second job to do the first one.
   */
  export type TimelineTrack = ClipAudioTrack & { label: string };

  interface Props {
    /** The rendered clip's length. The timeline is meaningless without it. */
    durationMs: number;
    /** Contact sheet of the render, drawn as the strip's background. */
    stripUrl: string;
    captions: TimedCaption[];
    /** Committed on release, not during the drag — one write per gesture. */
    oncaptions: (next: TimedCaption[]) => void;
    tracks: TimelineTrack[];
    onaudio: (id: number, changes: { start: number; end: number | null }) => void;
    /** The preview player, kept in step with the playhead both ways. */
    video?: HTMLMediaElement;
  }

  let { durationMs, stripUrl, captions, oncaptions, tracks, onaudio, video }: Props = $props();

  const duration = $derived(Math.max(durationMs / 1000, 0.1));

  /** Shortest anything may be dragged down to, so it can't vanish. */
  const MIN_SPAN = 0.3;

  /**
   * One height for every block, captions and beds alike.
   *
   * Captions were taller until they had no reason to be: nothing in one needs
   * more room than a bed's name does, and the height was only costing the strip
   * the frames it could have been showing.
   *
   * Beds stack up from the bottom. Two fit comfortably under the caption lane;
   * a third onwards is allowed to run behind it rather than shrinking every
   * lane to fit a worst case this isn't being laid out for.
   */
  const LANE_HEIGHT = 24;
  const LANE_GAP = 4;

  /**
   * How near either end of the window a dragged block has to get before the
   * strip starts pulling itself along, and how fast it goes at the very edge.
   *
   * Speed ramps with depth into the zone rather than switching on, so easing
   * towards the edge creeps and shoving into it moves.
   */
  const EDGE_ZONE = 100;
  const EDGE_SPEED = 16;

  let lane = $state<HTMLElement>();
  /** The window onto the strip, which is wider than it for all but a short clip. */
  let scroller = $state<HTMLElement>();

  /**
   * The strip's own width — a second is the same distance in every clip, rather
   * than however much of the column was going spare.
   */
  const stripWidth = $derived(duration * STRIP_PX_PER_SECOND);

  /**
   * A block on the timeline, whichever lane it's in.
   *
   * Captions and beds are drawn from the same shape and dragged by the same
   * code because on this surface they are the same thing: something that
   * starts, runs and stops. `openEnded` is the one difference — a bed with no
   * end of its own plays until the clip does, and moving it must not quietly
   * give it one.
   */
  interface Span {
    start: number;
    end: number;
    openEnded: boolean;
  }

  type Grip = 'move' | 'start' | 'end';

  /*
   * The drag in progress, as an overlay on the committed values.
   *
   * Held separately rather than mutating the source: the parent owns those, and
   * writing on every pointermove would be a save per pixel. The lanes read
   * through this while a drag is live and from the props otherwise.
   */
  let drag = $state<{
    kind: 'caption' | 'audio';
    key: number;
    grip: Grip;
    /** Where the pointer went down, in seconds. */
    from: number;
    /** The block as it was before this gesture. */
    was: Span;
    /** Live value, shown while the pointer is down. */
    now: Span;
  } | null>(null);

  const captionSpan = (c: TimedCaption): Span => ({ start: c.start, end: c.end, openEnded: false });

  const trackSpan = (t: TimelineTrack): Span => ({
    start: t.start,
    end: t.end ?? duration,
    openEnded: t.end === null
  });

  /** What a lane should draw: the live drag, or the truth. */
  function shown(kind: 'caption' | 'audio', key: number, span: Span): Span {
    return drag && drag.kind === kind && drag.key === key ? drag.now : span;
  }

  const percent = (seconds: number) => `${(seconds / duration) * 100}%`;

  /**
   * Whether a block is wide enough to carry its name as well as its timings.
   *
   * Measured from the data rather than the element: a block's width in pixels
   * is its length times the strip's fixed rate, so this is known before
   * anything is drawn and needs no container query to find out.
   */
  const roomForBoth = (span: Span) => (span.end - span.start) * STRIP_PX_PER_SECOND >= 108;

  /** Where a pointer is on the strip, in seconds. */
  function secondsAt(clientX: number): number {
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    const fraction = (clientX - box.left) / box.width;
    return Math.min(duration, Math.max(0, fraction * duration));
  }

  /** Tenths, matching the fields these drags write into. */
  const snap = (seconds: number) => Math.round(seconds * 10) / 10;

  // --- playhead ----------------------------------------------------------

  /*
   * Followed with rAF rather than `timeupdate`, which fires about four times a
   * second — enough to know the time, far too few to draw a playhead moving
   * along a strip without it stepping.
   */
  let playhead = $state(0);
  /** Whether the clip is actually running, as opposed to parked somewhere. */
  let playing = $state(false);

  $effect(() => {
    const player = video;
    if (!player) return;

    let frame = 0;
    const follow = () => {
      playhead = player.currentTime;
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);

    const started = () => (playing = true);
    const stopped = () => (playing = false);
    player.addEventListener('play', started);
    player.addEventListener('pause', stopped);
    player.addEventListener('ended', stopped);
    playing = !player.paused;

    return () => {
      cancelAnimationFrame(frame);
      player.removeEventListener('play', started);
      player.removeEventListener('pause', stopped);
      player.removeEventListener('ended', stopped);
    };
  });

  /*
   * Follow the playhead when it leaves the window, so a long clip doesn't play
   * on past the edge of what you can see.
   *
   * Only while it's actually playing. Parked, the playhead is not going
   * anywhere and following it means one thing only: undoing the pan that just
   * moved away from it, the instant the pointer is released. Navigating and
   * following are opposite intentions, and which one is meant is exactly the
   * difference between playing and paused.
   *
   * Nor while anything is being dragged — scrolling under a pointer that's
   * holding a block moves the thing and the ground it's measured against at the
   * same time, and the drag lands somewhere nobody chose.
   */
  $effect(() => {
    const box = scroller;
    const x = playhead * STRIP_PX_PER_SECOND;
    if (!box || drag || panning || !playing) return;

    const margin = 40;
    if (x < box.scrollLeft + margin || x > box.scrollLeft + box.clientWidth - margin) {
      box.scrollTo({ left: Math.max(0, x - box.clientWidth / 2), behavior: 'smooth' });
    }
  });

  /** Whether the strip is being dragged sideways right now. */
  let panning = $state(false);

  /**
   * Press on bare strip and drag to pull the timeline along; let go without
   * moving and the playhead goes where you pressed.
   *
   * A clip longer than the window is most of them, and reaching the far end
   * meant finding the scrollbar — off at the bottom edge, hidden until the
   * pointer is near it — to place a caption on footage you couldn't see. Now
   * the strip itself is the handle, the way a map is.
   *
   * The two gestures start identically and are told apart by whether the
   * pointer travelled, which is the only honest way to know: a press that never
   * moves was a click, and there is nothing to decide until it either moves or
   * ends.
   *
   * Panned by pixels against the scroll position at the start, not by where the
   * pointer is now over the strip — the strip is moving underneath it, and
   * measuring against something in motion would accelerate away.
   *
   * Never fires over a block: those stop the event, so a drag that began on one
   * is that block's, and panning underneath it would fight the edit.
   */
  function startPan(e: PointerEvent) {
    if (drag || e.button !== 0 || !lane) return;

    const target = lane;
    const box = scroller;
    const at = secondsAt(e.clientX);
    const fromX = e.clientX;
    const fromScroll = box?.scrollLeft ?? 0;
    let moved = false;
    const release = beginDragGesture();

    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Already gone; the listeners below still see the gesture through.
    }

    const move = (ev: PointerEvent) => {
      const travelled = ev.clientX - fromX;
      // A few pixels of slop, so a click with an unsteady hand is still a click.
      if (!moved && Math.abs(travelled) < 4) return;
      moved = true;
      panning = true;
      if (box) box.scrollLeft = fromScroll - travelled;
    };

    const finish = (ev: PointerEvent) => {
      release();
      panning = false;
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // Never captured, or already released.
      }
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);

      if (!moved && video) video.currentTime = at;
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }

  // --- dragging ----------------------------------------------------------

  /**
   * The block this gesture would produce, moved or resized by `shift`.
   *
   * Moving clamps as a whole so a block pushed off either end keeps its length
   * instead of being squashed against the edge — the drag was "put this
   * somewhere else", not "make this shorter".
   */
  function applied(was: Span, grip: Grip, shift: number): Span {
    if (grip === 'move') {
      const span = was.end - was.start;
      // The outer clamp matters for a block longer than the clip, which the
      // fields allow: without it the inner one hands back a negative start.
      const start = snap(Math.max(0, Math.min(was.start + shift, duration - span)));
      return { ...was, start, end: snap(start + span) };
    }
    if (grip === 'start') {
      return { ...was, start: snap(Math.min(Math.max(0, was.start + shift), was.end - MIN_SPAN)) };
    }
    // Dragging the far edge is how an open-ended bed gets an end of its own.
    return {
      ...was,
      end: snap(Math.max(Math.min(duration, was.end + shift), was.start + MIN_SPAN)),
      openEnded: false
    };
  }

  /**
   * Re-derives the dragged block from wherever the pointer is over the strip.
   *
   * Called both when the pointer moves and when the strip moves under a still
   * pointer, because those are the same event as far as the block is concerned:
   * what matters is which moment is under the cursor, not which of the two got
   * it there.
   */
  function updateDrag(clientX: number) {
    if (!drag) return;
    drag = { ...drag, now: applied(drag.was, drag.grip, secondsAt(clientX) - drag.from) };
  }

  /** Last seen pointer position, so the edge pull works while it's held still. */
  let pointerX = 0;
  let edgeFrame = 0;

  /**
   * Pulls the strip along while a block is held near either end of the window.
   *
   * Its own frame loop rather than something driven by pointermove: holding
   * still at the edge is precisely the gesture — the pointer stops sending
   * events at the moment the scrolling most needs to continue.
   */
  function edgePull() {
    edgeFrame = requestAnimationFrame(edgePull);

    const box = scroller;
    if (!box || !drag) return;

    const rect = box.getBoundingClientRect();
    let depth = 0;
    if (pointerX < rect.left + EDGE_ZONE) {
      depth = (pointerX - (rect.left + EDGE_ZONE)) / EDGE_ZONE;
    } else if (pointerX > rect.right - EDGE_ZONE) {
      depth = (pointerX - (rect.right - EDGE_ZONE)) / EDGE_ZONE;
    }
    if (depth === 0) return;

    const before = box.scrollLeft;
    box.scrollLeft = before + Math.max(-1, Math.min(1, depth)) * EDGE_SPEED;
    // Already at one end: nothing moved, so nothing to re-derive.
    if (box.scrollLeft === before) return;

    updateDrag(pointerX);
  }

  function startDrag(
    e: PointerEvent,
    kind: 'caption' | 'audio',
    key: number,
    grip: Grip,
    was: Span
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const release = beginDragGesture();
    drag = { kind, key, grip, from: secondsAt(e.clientX), was, now: was };

    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Already gone; the listeners below still see the gesture through.
    }

    pointerX = e.clientX;
    edgeFrame = requestAnimationFrame(edgePull);

    const move = (ev: PointerEvent) => {
      pointerX = ev.clientX;
      updateDrag(ev.clientX);
    };

    const finish = () => {
      release();
      cancelAnimationFrame(edgeFrame);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);

      const settled = drag;
      drag = null;
      if (!settled) return;

      const { was: before, now } = settled;
      if (now.start === before.start && now.end === before.end) return;

      if (settled.kind === 'caption') {
        oncaptions(
          captions.map((c, i) => (i === settled.key ? { ...c, start: now.start, end: now.end } : c))
        );
      } else {
        // An end is only sent once the block has one of its own; otherwise the
        // bed keeps running to the end of the clip, whatever that becomes.
        onaudio(settled.key, { start: now.start, end: now.openEnded ? null : now.end });
      }
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }
</script>

<!--
  What a block says: when it is, and — if it can afford to — what it is.

  The timings are the part that's always true and always wanted, so they hold
  the block and the name is what gives way. A short caption that shows its own
  first word and nothing else tells you less than one showing where it lands;
  the word is already in the list above, the timing is only here.

  Right-aligned in its own column so the name can run out of room without
  pushing them off, and so they hold still while they count rather than
  shuffling under the cursor as their width changes.
-->
{#snippet blockText(label: string, at: Span)}
  {@const roomy = roomForBoth(at)}
  <span class="flex h-full min-w-0 flex-1 items-center gap-1.5 px-1">
    {#if roomy}
      <span class="min-w-0 flex-1 truncate text-left">{label}</span>
    {/if}
    <span class="min-w-0 flex-1 truncate text-right tabular-nums {roomy ? 'opacity-70' : ''}">
      {at.start.toFixed(1)}–{at.end.toFixed(1)}
    </span>
  </span>
{/snippet}

<!-- The strip, the captions over it, and the music under them: one stack, one
     time axis, so what lines up on screen lines up in the render.

     No frame around it and nothing written underneath. This fills its footer
     edge to edge, and every row of chrome was a row the clip wasn't using. -->
<div bind:this={scroller} class="overflow-x-auto">
  <div
    bind:this={lane}
    role="presentation"
    onpointerdown={startPan}
    class="relative h-32 bg-gray-900 select-none {panning ? 'cursor-grabbing' : 'cursor-grab'}"
    style="width: {stripWidth}px; background-image: url({stripUrl}); background-size: 100% 100%;"
  >
    <!-- Darkened so the blocks read against whatever was filmed. -->
    <div class="absolute inset-0 bg-black/40"></div>

    {#each captions as caption, index (index)}
      {@const at = shown('caption', index, captionSpan(caption))}
      <div
        class="absolute flex items-center rounded border border-violet-400/70 bg-violet-600/80 text-[10px] text-white shadow {drag?.kind ===
          'caption' && drag.key === index
          ? 'ring-2 ring-violet-300'
          : ''}"
        style="left: {percent(at.start)}; width: {percent(
          Math.max(at.end - at.start, 0.05)
        )}; top: 8px; height: {LANE_HEIGHT}px"
      >
        <!-- Edges resize, the middle moves. Each is its own target rather than
             one handler reading where in the block the pointer landed, so a
             narrow block's edges stay grabbable instead of covering it. -->
        <button
          type="button"
          aria-label="Caption {index + 1} start"
          onpointerdown={(e) => startDrag(e, 'caption', index, 'start', captionSpan(caption))}
          class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-violet-300/70 hover:bg-violet-200"
        ></button>
        <button
          type="button"
          aria-label="Move caption {index + 1}"
          title={caption.text || 'Empty caption'}
          onpointerdown={(e) => startDrag(e, 'caption', index, 'move', captionSpan(caption))}
          class="flex h-full min-w-0 flex-1 cursor-grab items-center active:cursor-grabbing"
        >
          {@render blockText(caption.text || '—', at)}
        </button>
        <button
          type="button"
          aria-label="Caption {index + 1} end"
          onpointerdown={(e) => startDrag(e, 'caption', index, 'end', captionSpan(caption))}
          class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-violet-300/70 hover:bg-violet-200"
        ></button>
      </div>
    {/each}

    {#each tracks as track, index (track.id)}
      {@const at = shown('audio', track.id, trackSpan(track))}
      <!-- Drawn and dragged exactly like a caption, because on this surface it
           now is one in every way that matters: it starts, it runs, it stops.
           The only tell is the colour and the lane it sits in. -->
      <div
        class="absolute flex items-center rounded border border-emerald-400/60 bg-emerald-700/75 text-[10px] text-emerald-50 {drag?.kind ===
          'audio' && drag.key === track.id
          ? 'ring-2 ring-emerald-300'
          : ''}"
        style="left: {percent(at.start)}; width: {percent(
          Math.max(at.end - at.start, 0.05)
        )}; bottom: {8 + index * (LANE_HEIGHT + LANE_GAP)}px; height: {LANE_HEIGHT}px"
      >
        <button
          type="button"
          aria-label="{track.label} start"
          onpointerdown={(e) => startDrag(e, 'audio', track.id, 'start', trackSpan(track))}
          class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-emerald-300/80 hover:bg-emerald-200"
        ></button>
        <button
          type="button"
          aria-label="Move {track.label}"
          title={track.label}
          onpointerdown={(e) => startDrag(e, 'audio', track.id, 'move', trackSpan(track))}
          class="flex h-full min-w-0 flex-1 cursor-grab items-center active:cursor-grabbing"
        >
          {@render blockText(track.label, at)}
        </button>
        <button
          type="button"
          aria-label="{track.label} end"
          onpointerdown={(e) => startDrag(e, 'audio', track.id, 'end', trackSpan(track))}
          class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-emerald-300/80 hover:bg-emerald-200"
        ></button>
      </div>
    {/each}

    <!-- Drawn last so it rides over everything it's measuring. -->
    <div
      class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_4px_rgba(0,0,0,0.9)]"
      style="left: {percent(Math.min(playhead, duration))}"
    ></div>
  </div>
</div>
