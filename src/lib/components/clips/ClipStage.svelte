<script lang="ts" module>
  import { monitor } from '$lib/clips/monitor.svelte';
  import type { AppliedEffect, ClipFill } from '$lib/clips/types';

  /**
   * One shot, as the stage needs it: when it shows, what it shows, and how it
   * sits in the frame.
   *
   * Deliberately not `TimelineClip`. The strip wants headroom, labels and
   * posters; this wants a file and a mapping from clip time to file time, and
   * sharing one type would mean the stage re-rendering every time a block's
   * label changed.
   */
  export interface StageShot {
    id: number;
    /** When it shows, in timeline seconds. */
    start: number;
    end: number;
    /** Where in the file it starts, in source seconds. */
    from: number;
    /** Source seconds per timeline second. */
    speed: number;
    /** The proxy, which is what plays here; never the footage as shot. */
    url: string;
    /** A held picture rather than footage: nothing to play, nothing to seek. */
    still: boolean;
    /** Its own sound, off. */
    muted: boolean;
    rotation: number;
    /** How it fills the frame, or null while it follows the clip. */
    fit: ClipFill | null;
    zoom: number;
    pan: boolean;
    fadeIn: boolean;
    fadeOut: boolean;
    /** The footage's own size, for deciding whether a fill has anything to do. */
    width: number | null;
    height: number | null;
    alt?: string | null;
    /** This shot's own effects, which travel with it. Null takes the clip's. */
    effects?: AppliedEffect[] | null;
  }
</script>

<script lang="ts">
  import { effectiveFill, panAt } from '$lib/clips/framing';
  import { pictureCss } from '$lib/clips/effects';
  import type { ClipPlayback } from '$lib/clips/playback.svelte';
  import FootageLook from './FootageLook.svelte';

  /**
   * The clip, playing, before anything has been rendered.
   *
   * Two elements rather than one: a cut is the next shot already decoded and
   * parked on its first frame, swapped for the one going off. Loading a file at
   * the moment it is needed is a black frame on every cut — which reads as the
   * edit being broken rather than as the browser being busy.
   *
   * The clock is the authority, never the elements. A video that drifts is
   * pulled back to where the clip says it should be; a video that ends early is
   * simply no longer the shot under the playhead. Nothing here reports a time
   * upwards, which is what kept the old preview and the strip disagreeing.
   */
  let {
    shots,
    clock,
    frame,
    fill,
    blurStrength,
    fadeSeconds,
    pictureStyle,
    fps = 30
  }: {
    shots: StageShot[];
    clock: ClipPlayback;
    /** The render's frame in pixels, which is what the fills are decided against. */
    frame: { width: number; height: number };
    /** The clip's own fill, for shots that don't override it. */
    fill: ClipFill;
    blurStrength: number;
    /** How long a shot's own fade runs, before it is clamped to half the shot. */
    fadeSeconds: number;
    /** The look, as a filter and a transform: the picture wears it, nothing else does. */
    pictureStyle?: string;
    /** The clip's frame rate, for a shot's own effects that have a rhythm. */
    fps?: number;
  } = $props();

  /** How wide the stage is drawn, so a blur in render pixels can be scaled to it. */
  let shownWidth = $state(0);
  let shownHeight = $state(0);

  /**
   * What's under the playhead — all of it, in the order it is composited.
   *
   * Two shots at once is not a mistake, it's a dissolve: a crossfade here is
   * two blocks overlapping on the strip with a fade on the edge between them,
   * which is the same thing the render composites and the same thing you can
   * see yourself without being told. Last is on top, the way the overlay
   * chain stacks them.
   *
   * Two at a time, because there are two decoders. A third overlapping shot
   * is a picture nobody can see under the two above it.
   */
  const showing = $derived.by(() => {
    const found: StageShot[] = [];
    for (const shot of shots) if (clock.at >= shot.start && clock.at < shot.end) found.push(shot);
    return found.slice(-2);
  });

  const top = $derived<StageShot | null>(showing[showing.length - 1] ?? null);

  /** The one to have ready: whatever starts next. */
  const ahead = $derived.by(() => {
    const after = top ? top.end : clock.at;
    let soonest: StageShot | null = null;
    for (const shot of shots) {
      if (shot.start < after - 0.001) continue;
      if (!soonest || shot.start < soonest.start) soonest = shot;
    }
    return soonest;
  });

  const SLOTS = ['a', 'b'] as const;
  type Slot = (typeof SLOTS)[number];

  /*
   * A slot holds a name, not a shot.
   *
   * It used to hold the shot itself, which made it a copy taken the moment the
   * slot was filled — and only a change of id ever swapped it. So editing a
   * shot already on screen changed nothing: its look, its fill and its fades
   * went on being whatever they were when it arrived. Holding the id and
   * looking it up means the stage always draws the shot as it is now.
   */
  let slots = $state<Record<Slot, number | null>>({ a: null, b: null });
  let live = $state<Slot>('a');
  let els = $state<Record<Slot, HTMLVideoElement | undefined>>({ a: undefined, b: undefined });

  const other = $derived<Slot>(live === 'a' ? 'b' : 'a');

  const byId = $derived(new Map(shots.map((shot) => [shot.id, shot])));

  /** Whichever shot a slot is holding, as it stands now. */
  function held(slot: Slot): StageShot | null {
    const id = slots[slot];
    return id == null ? null : (byId.get(id) ?? null);
  }

  /*
   * Who holds what.
   *
   * One effect rather than several, because "show this", "show that under it"
   * and "have the next one ready" are decisions about the same two slots and
   * would otherwise take turns evicting each other's shot.
   *
   * The top shot keeps the live slot; the other holds whatever is dissolving
   * with it, or — when nothing is — the shot that comes next, loaded and
   * parked. Loading a file at the moment it is needed is a black frame on
   * every cut.
   */
  $effect(() => {
    const over = top;
    const under = showing.length > 1 ? showing[0] : null;
    const next = ahead;

    if (over && slots[live] !== over.id) {
      if (slots[other] === over.id) {
        live = other;
      } else {
        // Nothing primed it — a seek, a fresh page, a shot dropped in under
        // the playhead. It loads now and shows a frame late, which is the cost
        // of arriving somewhere nobody was heading.
        slots = { ...slots, [other]: over.id };
        live = other;
      }
      return;
    }

    const wanted = under ?? next;
    if (wanted && slots[other] !== wanted.id && slots[live] !== wanted.id) {
      slots = { ...slots, [other]: wanted.id };
    }
  });

  /** Whether a slot's shot is one of the ones on screen right now. */
  function onScreen(slot: Slot): boolean {
    const id = slots[slot];
    return id != null && showing.some((s) => s.id === id);
  }

  /** Where in its own file a shot is, at a moment of the clip. */
  function sourceAt(shot: StageShot, at: number): number {
    return shot.from + Math.max(0, at - shot.start) * shot.speed;
  }

  /*
   * The picture, pulled back to the clock.
   *
   * Runs on every tick while playing, which sounds expensive and is three
   * comparisons: the element plays itself, and this only notices when it has
   * wandered. A sixth of a second is roughly five frames — tight enough that
   * nothing reads as out of step, loose enough that we are not seeking a
   * decoder in a loop.
   */
  $effect(() => {
    const at = clock.at;
    const running = clock.playing;

    for (const slot of SLOTS) {
      const shot = held(slot);
      const el = els[slot];
      if (!el || !shot || shot.still) continue;

      // Both sound through a dissolve, the way both parts' audio is mixed in
      // the render. Silent otherwise, whichever slot it is.
      el.muted = shot.muted || !onScreen(slot);
      // The room's level, which is not the clip's: nothing here reaches the
      // file, it is only how loud the editor is while you work.
      el.volume = monitor.level;

      if (!onScreen(slot)) {
        // Parked on the frame it will come in on, so the cut has something to
        // show the instant it arrives.
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - shot.from) > 0.05) el.currentTime = shot.from;
        continue;
      }

      const want = sourceAt(shot, at);
      el.playbackRate = shot.speed || 1;

      if (running) {
        if (Math.abs(el.currentTime - want) > 0.16) el.currentTime = want;
        if (el.paused) void el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.03) el.currentTime = want;
      }
    }
  });

  /** How a shot is drawn: the fill, the zoom, the drift and the turn. */
  function layer(shot: StageShot, at: number, background: boolean): string {
    const source = shot.width && shot.height ? { width: shot.width, height: shot.height } : null;
    const chosen = effectiveFill(shot.fit ?? fill, frame, source, shot.rotation);
    const zoom = Math.max(1, shot.zoom || 1);
    const window = panAt(
      frame,
      source,
      shot.rotation,
      zoom,
      shot.pan,
      Math.max(0.05, shot.end - shot.start),
      Math.max(0, at - shot.start)
    );
    const x = (window.x * 100).toFixed(2);
    const y = (window.y * 100).toFixed(2);

    /*
     * A quarter turn is the one case the box has to change as well as the
     * picture: the footage is fitted after the turn, the way the renderer
     * transposes before it scales. Measured rather than written in CSS because
     * the two axes are swapped, which no percentage can say.
     */
    const quarter = Math.abs(((shot.rotation % 360) + 360) % 360) % 180 === 90;
    const box = quarter
      ? `width: ${shownHeight}px; height: ${shownWidth}px; left: 50%; top: 50%; margin-left: ${-shownHeight / 2}px; margin-top: ${-shownWidth / 2}px;`
      : 'width: 100%; height: 100%; left: 0; top: 0;';

    const turn = shot.rotation ? ` rotate(${shot.rotation}deg)` : '';

    if (background) {
      // Blown up, blurred, and only ever behind a picture that doesn't cover
      // the frame. In render pixels the blur is a box radius; here it is
      // whatever that comes to at the size the stage is actually drawn.
      const radius = (blurStrength * (shownWidth || frame.width)) / frame.width;
      return (
        `${box} object-fit: cover; object-position: 50% 50%;` +
        ` filter: blur(${radius.toFixed(1)}px); transform: scale(1.08)${turn};`
      );
    }

    if (chosen === 'black' || chosen === 'blur') {
      return `${box} object-fit: contain; transform: scale(1)${turn};`;
    }

    return (
      `${box} object-fit: cover; object-position: ${x}% ${y}%;` +
      ` transform: scale(${zoom})${turn}; transform-origin: ${x}% ${y}%;`
    );
  }

  /**
   * A shot's own look, at the moment of the shot it is in.
   *
   * On its own clock, the way the render runs it inside the part: a rhythm in
   * an effect is a rhythm through the shot, not through the clip. The clip's
   * effects are drawn over everything by the caller; these are only ever this
   * layer's.
   */
  function ownLook(shot: StageShot, at: number) {
    if (!shot.effects?.length) return null;
    const drawn = pictureCss(
      { effects: shot.effects },
      {
        width: frame.width,
        height: frame.height,
        fps,
        duration: Math.max(0.05, shot.end - shot.start)
      },
      Math.max(0, at - shot.start)
    );

    /*
     * The SVG halves are referenced after the plain filter functions, which
     * puts them in the order the render runs them. Named after the shot, so
     * two shots wearing different looks don't borrow each other's definitions
     * — the ids are global to the document however local the look is.
     */
    const refs = drawn.svg.map((_, index) => `url(#shot-${shot.id}-${index})`).join(' ');
    return { ...drawn, filter: [drawn.filter, refs].filter(Boolean).join(' ') };
  }

  /** Whether a shot wants a blurred copy of itself behind it. */
  function needsBackdrop(shot: StageShot): boolean {
    const source = shot.width && shot.height ? { width: shot.width, height: shot.height } : null;
    return effectiveFill(shot.fit ?? fill, frame, source, shot.rotation) === 'blur';
  }

  /**
   * A shot's own fade, as opacity.
   *
   * Over black it reads as a fade from black, because the stage is black;
   * over another shot it dissolves into it. Which is what the render does,
   * for the same reason — the shots are composited, not concatenated.
   */
  function fade(shot: StageShot, at: number): number {
    if (!shot.fadeIn && !shot.fadeOut) return 1;
    const length = Math.max(0.05, shot.end - shot.start);
    const span = Math.max(0.05, Math.min(fadeSeconds, length / 2));
    const into = at - shot.start;
    const left = shot.end - at;
    let opacity = 1;
    if (shot.fadeIn && into < span) opacity = Math.min(opacity, Math.max(0, into / span));
    if (shot.fadeOut && left < span) opacity = Math.min(opacity, Math.max(0, left / span));
    return opacity;
  }
</script>

<!-- `isolate`, or the stacking inside this escapes it.
     The layers are ordered with `z-index` so a shot on the upper lane covers
     the one below during a dissolve. Without a stacking context of its own
     those numbers compete with the overlays drawn *after* the stage — the
     captions and the branding — and a shot with a z-index of 1 painted over
     them. Which looked like captions that simply didn't show, and only over
     some shots. -->
<div
  class="absolute inset-0 isolate overflow-hidden bg-black"
  bind:clientWidth={shownWidth}
  bind:clientHeight={shownHeight}
  style={pictureStyle}
>
  {#each SLOTS as slot (slot)}
    {@const shot = held(slot)}
    {#if shot}
      {@const seen = onScreen(slot)}
      {@const own = seen ? ownLook(shot, clock.at) : null}
      <div
        class="absolute inset-0"
        style="opacity: {seen ? fade(shot, clock.at) : 0}; visibility: {seen
          ? 'visible'
          : 'hidden'}; z-index: {shots.findIndex((s) => s.id === shot.id)}; {own?.filter
          ? `filter: ${own.filter};`
          : ''} {own?.transform ? `transform: ${own.transform};` : ''}"
      >
        {#if own}
          <!-- This shot's own filter definitions, named after the shot so two
               shots wearing different looks don't borrow each other's. -->
          <FootageLook svg={own.svg} overlay={own.overlay} id="shot-{shot.id}" />
        {/if}
        {#if needsBackdrop(shot)}
          {#if shot.still}
            <img
              src={shot.url}
              alt=""
              aria-hidden="true"
              class="absolute"
              style={layer(shot, clock.at, true)}
            />
          {:else}
            <!-- svelte-ignore a11y_media_has_caption -->
            <!-- The same file again, loosely in step: it is blurred past the
                 point where a frame either way can be told apart, and holding
                 it exactly would mean seeking two decoders instead of one. -->
            <video
              src={shot.url}
              muted
              playsinline
              preload="auto"
              class="absolute"
              style={layer(shot, clock.at, true)}
            ></video>
          {/if}
        {/if}

        {#if shot.still}
          <img
            src={shot.url}
            alt={shot.alt ?? ''}
            class="absolute"
            style={layer(shot, clock.at, false)}
          />
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={els[slot]}
            src={shot.url}
            playsinline
            preload="auto"
            class="absolute"
            style={layer(shot, clock.at, false)}
          ></video>
        {/if}
      </div>
    {/if}
  {/each}
</div>
