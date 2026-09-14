<script lang="ts">
  /**
   * The clip as an arrangement: what plays when, what's said over it, and what
   * it's scored with. Three kinds of block on one time axis.
   *
   * There used to be a contact sheet of the last render behind all this, and
   * taking it out is what made the rest work. Those were the *render's* frames,
   * so they had the previous captions burned into them and went stale the
   * moment anything moved — and nothing could be arranged until something had
   * been rendered, which is backwards. Meanwhile the picture is already on
   * screen at full size in the player, and the playhead follows whatever is
   * being dragged, so the frame under your hand is the one you're looking at.
   *
   * What replaces them is the thing the sheet couldn't say: which clip is
   * playing. That matters most in exactly the case a filmstrip is worst at —
   * the same shot used three times, three identical stretches of picture.
   *
   * Nothing here is new state. Every drag lands on the same values the fields
   * above already write, so this is a second way to say the same thing rather
   * than a second copy of it.
   */
  import { beginDragGesture } from '$lib/utils/drag';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import TimelineMinimap from './TimelineMinimap.svelte';
  import { STRIP_PX_PER_SECOND } from '$lib/clips/strip';
  import { secs, tidy } from '$lib/clips/time';
  import { captionAnchorOf, NO_BACKDROP } from '$lib/clips/types';
  import { PICTURE_EFFECTS, pictureEffectById } from '$lib/clips/effects';
  import CaptionDialog from './CaptionDialog.svelte';
  import FxDialog from './FxDialog.svelte';
  import TrackDialog from './TrackDialog.svelte';
  import {
    Icon,
    Play,
    Pause,
    SpeakerWave,
    SpeakerXMark,
    MusicalNote,
    Cog6Tooth,
    AdjustmentsHorizontal,
    Swatch,
    XMark,
    Sparkles,
    Film,
    ChatBubbleBottomCenterText
  } from 'svelte-hero-icons';
  import { insertAtCursor } from '$lib/utils/text';
  import { ColorWheel } from '$lib/components/ui';
  import type { AppliedEffect, CaptionAnchorId, PlacedEffect } from '$lib/clips/types';
  import type { ClipAudioTrack, TimedCaption } from '$lib/clips/types';
  import type { LayoutBlock } from '$lib/clips/layout';

  /**
   * A bed plus the name to write on it.
   *
   * The name is resolved by the caller rather than looked up here: the timeline
   * is handed what to draw, and giving it the media library to search through
   * would be handing it a second job to do the first one.
   */
  /** A source clip in the place it plays, with what to write on it. */
  export type TimelineClip = LayoutBlock & {
    label: string;
    /** The source's own poster, so a shot is recognisable without a filmstrip. */
    poster: string | null;
    /**
     * How much of the file is left either side of what's being used, in
     * timeline seconds.
     *
     * Trimming a clip is bounded by the footage that exists: you can give back
     * what you cut and no more. Sent as timeline seconds rather than source
     * seconds so the block, which is drawn in timeline seconds, can be clamped
     * without knowing the speed.
     */
    headroom: number;
    tailroom: number;
    /** Where in the file it starts and stops, in source seconds. */
    from: number;
    to: number;
    /** The whole file's length in source seconds. */
    length: number;
    /** Source seconds per timeline second, for reading a live drag back. */
    speed: number;
    /** Whether its own sound is off, which the block both shows and sets. */
    muted: boolean;
    /** Whether it fades up at its start, and away at its end. */
    fadeIn: boolean;
    fadeOut: boolean;
  };

  export type TimelineTrack = ClipAudioTrack & {
    label: string;
    /** How long the file itself is, in seconds. Zero when it isn't known. */
    length: number;
    /** A picture of the whole song, or null while there isn't one yet. */
    waveform: string | null;
  };

  interface Props {
    /** How long the clip runs, worked out from the edit rather than a render. */
    duration: number;
    /** The source clips, in the places they play. */
    clips: TimelineClip[];
    captions: TimedCaption[];
    /** Committed on release, not during the drag — one write per gesture. */
    oncaptions: (next: TimedCaption[]) => void;
    /**
     * The three heights as this clip has them set, so the icon on a block shows
     * where a caption will actually land rather than where it would by default.
     */
    anchors: { id: CaptionAnchorId; label: string; y: number }[];
    /** The colours kept in Appearance, offered on the caption picker. */
    swatches?: string[];
    /** Puts a colour on that shelf, or takes it off. */
    onkeepcolor?: (color: string) => void;
    /** What a caption is drawn in when it hasn't picked a colour of its own. */
    inheritedColor?: string;
    /** The panel colour a caption gets when it hasn't picked one; null for none. */
    inheritedBackdrop?: string | null;
    /** How the clip says captions arrive, when one hasn't chosen for itself. */
    inheritedEffect?: AppliedEffect | null;
    /** Passed to the effect dialog, so its picker can show real swatches. */
    clipId?: number | null;
    /**
     * The look the whole clip is in, if it is in one.
     *
     * Set in the Look panel rather than here, because it has no position to
     * drag — but the strip has to say it is on, or the lane shows one short
     * block and implies that is everything happening to the picture. Drawn as
     * the lane's floor rather than as a block, which is also what stops this
     * needing a second row: placed effects sit on top of it, the way they sit
     * on top of the footage.
     */
    wideEffect?: AppliedEffect | null;
    /**
     * Footage effects placed on the timeline.
     *
     * Only the placed ones. A look covering the whole clip has no position to
     * draw, and a block spanning the entire strip would be a bar that can't be
     * moved and doesn't mean anything by being where it is — it lives in the
     * Look panel with the tone and the grain, which are the same kind of
     * statement about the whole clip.
     */
    effects?: PlacedEffect[];
    oneffects?: (next: PlacedEffect[]) => void;
    tracks: TimelineTrack[];
    onaudio: (
      id: number,
      changes: {
        start?: number;
        end?: number | null;
        lane?: number;
        /** Seconds to move the cue point by, when the head was trimmed. */
        seekBy?: number;
        fadeIn?: boolean;
        fadeOut?: boolean;
        duck?: boolean;
      }
    ) => void;
    /**
     * A clip trimmed by its edges, in timeline seconds either side.
     *
     * Deltas rather than new trim points: the timeline knows how much shorter
     * or longer the block got, and the editor knows the speed that turns that
     * into source seconds. Splitting it that way keeps the conversion in one
     * place instead of two that can disagree.
     */
    /**
     * Show one source on its own, in the pane the render uses.
     *
     * Judging a shot means watching it, and until now the only way was to
     * render the whole edit or open the row's own little player. The big pane
     * is already the place where a moving picture goes.
     */
    onpreview: (kind: 'clip' | 'audio', id: number, play: boolean) => void;
    /** Which source the pane is showing, so its block can say so. */
    selection?: { kind: 'clip' | 'audio'; id: number } | null;
    /** Whether that one is running, so its button can offer to stop it. */
    selectionPlaying?: boolean;
    onclip: (
      id: number,
      changes: { head?: number; tail?: number; start?: number; lane?: number; slip?: number }
    ) => void;
    /** The preview player, kept in step with the playhead both ways. */
    video?: HTMLMediaElement;
    /**
     * While an edge is dragged, the moment in that block's own file under it.
     *
     * The render's playhead can't answer "what frame am I cutting on" for a
     * block that's showing on its own in the pane: the two run on different
     * clocks. This reports the source time so whoever is showing that file can
     * park on the frame the edge is currently at.
     */
    onscrubsource?: (kind: 'clip' | 'audio', id: number, seconds: number) => void;
    /** Silences a clip's own audio, so a bed can play over it clean. */
    onmute: (id: number, muted: boolean) => void;
    /** Fades on a single shot, which dissolve into whatever is underneath. */
    onfade?: (id: number, fades: { fadeIn?: boolean; fadeOut?: boolean }) => void;
    /** Takes the placement off the timeline. Undoable, by whoever handles it. */
    onremove: (kind: 'clip' | 'audio', id: number) => void;
    /** Takes a caption off, by its place in the list. Undoable the same way. */
    oncaptionremove: (index: number) => void;
    /**
     * Everything starting at or after `from` moved by `shift` seconds.
     *
     * One message rather than a stream of per-block ones: the timeline knows
     * what happened, the page knows how to write it down, and saying it once
     * means the whole ripple lands or none of it does.
     */
    onripple: (from: number, shift: number) => void;
  }

  let {
    duration,
    clips,
    captions,
    anchors,
    swatches = [],
    onkeepcolor,
    inheritedColor = '#ffffff',
    inheritedBackdrop = null,
    inheritedEffect = null,
    effects = [],
    oneffects,
    clipId = null,
    wideEffect = null,
    oncaptions,
    tracks,
    onaudio,
    onclip,
    onpreview,
    onmute,
    onfade,
    onremove,
    oncaptionremove,
    onripple,
    selection = null,
    selectionPlaying = false,
    video,
    onscrubsource
  }: Props = $props();

  /** Shortest anything may be dragged down to, so it can't vanish. */
  const MIN_SPAN = 0.3;

  /**
   * One height for every block, whatever kind it is.
   *
   * Lanes are stacked from the top in a fixed order — the clips, then the
   * captions, then a lane per bed — and the strip is however tall that comes
   * to. They used to be pinned to the top and the bottom and left to collide in
   * the middle once there were more than two beds, which is a layout that works
   * until the moment you need it to.
   */
  /**
   * A row's height depends on what goes in it.
   *
   * A clip row carries a picture, and a picture the height of a line of text is
   * not a picture — it's a coloured smudge that happens to come from the
   * footage. Captions and beds carry a word and a number, which is what a line
   * of text is for, so they give up the room the clips need.
   */
  /**
   * Where a caption lands before anyone moves it.
   *
   * There was a clip-wide caption position beside the aspect and the tone that
   * decided this, and it read as the setting for where captions go — but a
   * caption you had touched carried its own height and ignored it, so the two
   * disagreed and the visible one lost. The block is the control now, and this
   * is only its starting point.
   */
  const DEFAULT_ANCHOR: CaptionAnchorId = 'bottom';

  /*
   * Two heights, not three, and close enough together to read as a grid.
   *
   * A caption and a bed are both a line of text on a coloured bar, so they are
   * the same. Footage is a picture, and a picture wants the room — but the gap
   * used to be 58 against 34, which with one type size on all of them looked
   * like a mistake in the tall lane rather than a photograph in it. Fourteen
   * pixels says "this one has a picture in it"; twenty-four said "these are
   * different kinds of thing".
   */
  const LANE_HEIGHTS = { fx: 22, clip: 52, caption: 38, audio: 38 } as const;
  const LANE_GAP = 5;
  /** Above the first lane and below the last, so nothing sits on the edge. */
  const LANE_INSET = 6;

  /**
   * The clips lane, then the captions, then one per bed — and never fewer than
   * this many rows' worth of height.
   *
   * The empty lanes are the point rather than an accident. A timeline sized
   * exactly to what is already on it has nowhere to put anything, and reads as
   * finished; leaving room says there is more to add and gives it somewhere to
   * land.
   */
  /**
   * Two rows each for clips and captions, one for beds.
   *
   * A clip is tallest, because it carries a picture. A bed comes next: it ended
   * up carrying a waveform, a name, four toggles and a slip rail, and at a
   * caption's height the rail took a quarter of it and the waveform read as a
   * smear behind the icons. A caption is a line of text you want to be able to
   * write in, which is all the room it needs.
   *
   * Two is the smallest number that can show an overlap — the case a single row
   * hides by drawing one block on top of another — and it leaves somewhere to
   * drop the next thing. Clips need that: a cut is two shots meeting, and
   * seeing where they meet is the point.
   *
   * Captions need it for a different reason, and it is not the overlap: one
   * line standing for the whole clip while others come and go underneath it is
   * an ordinary thing to want, and with a single row the standing one has to be
   * cut into pieces around every other. Worth saying because the vertical space
   * is tempting and this is the second time it has been eyed up.
   *
   * Beds don't. Two overlapping beds crossfade, which the render does from the
   * overlap itself with no regard for rows, so a second row bought nothing but
   * a way to look at it — and vertical space is the scarcest thing on the
   * strip. Spending it on one taller row instead buys a waveform, which is
   * worth more than a picture of an overlap that was never ambiguous.
   */
  /**
   * One row, and shorter than anything else on the strip.
   *
   * An effect block has nothing in it but a name — no picture, no waveform, no
   * field to type in — so the room the other lanes need would be room spent on
   * a coloured bar. Twenty-two pixels is enough to read a word in and to grab
   * an edge of, and being visibly the shortest lane is itself useful: it says
   * this row holds something different from the three below it.
   *
   * Above the clips because an effect is over the footage rather than in it.
   * The strip reads top to bottom as what happens to the picture, then the
   * picture, then what is written on it, then what is heard — and putting the
   * processing under the shots it processes would read backwards.
   *
   * Two rows, for reading rather than for meaning.
   *
   * Unlike the clips lane there is nothing to disambiguate here — effects that
   * overlap all apply, and the render never asks which row anything is in. But
   * a look held across a chorus with a tear on top of it drew one block over
   * another, and a lane you have to click through to understand is a lane that
   * is lying about how much is on it. The second row separates them on the
   * strip and changes nothing about the file.
   */
  const FX_ROWS = 2;
  const CLIP_ROWS = 2;
  const CAPTION_ROWS = 2;
  const AUDIO_ROWS = 1;
  const laneCount = FX_ROWS + CLIP_ROWS + CAPTION_ROWS + AUDIO_ROWS;

  /** Every row in order, so heights and offsets are read from one list. */
  const rows = [
    ...Array.from({ length: FX_ROWS }, () => 'fx' as const),
    ...Array.from({ length: CLIP_ROWS }, () => 'clip' as const),
    ...Array.from({ length: CAPTION_ROWS }, () => 'caption' as const),
    ...Array.from({ length: AUDIO_ROWS }, () => 'audio' as const)
  ];

  /** Where each row's top edge sits. Constant, now that the shape is. */
  const rowTops = rows.reduce<number[]>((tops, kind, index) => {
    tops.push(
      index === 0 ? LANE_INSET : tops[index - 1] + LANE_HEIGHTS[rows[index - 1]] + LANE_GAP
    );
    return tops;
  }, []);

  /**
   * Top and bottom of the lanes themselves, without the inset either side.
   *
   * The ticks used to run the full height of the strip, which drew them through
   * the six pixels of padding above the first lane and below the last — so the
   * padding read as another lane, an empty one with a ruler in it, sitting
   * above the effects. It is meant to be the margin that stops a block touching
   * the edge, and nothing else should be in it.
   */
  const lanesTop = LANE_INSET;

  const stripHeight = rows.reduce(
    (total, kind) => total + LANE_HEIGHTS[kind] + LANE_GAP,
    LANE_INSET * 2 - LANE_GAP
  );

  /** How tall the lanes are between them, for anything drawn across all of them. */
  const lanesHeight = stripHeight - LANE_INSET * 2;

  /** Where each group of rows begins. */
  const CLIPS_AT = FX_ROWS;
  const CAPTIONS_AT = FX_ROWS + CLIP_ROWS;
  const AUDIO_AT = FX_ROWS + CLIP_ROWS + CAPTION_ROWS;

  /**
   * Width of the column of icons down the left-hand side.
   *
   * There deliberately wasn't one: the lanes were told apart by colour, on the
   * grounds that a column of words costs sixty pixels of a surface made of
   * horizontal space. Icons cost a third of that and say it outright, which is
   * a better trade than the colours were making — especially now there are four
   * lanes rather than three and two of them are shades of grey.
   */
  const GUTTER = 26;

  /**
   * One icon per band, centred on the rows it covers.
   *
   * Bands, not rows: two caption rows are one idea and labelling both would
   * say it twice.
   */
  const laneBands = $derived(
    [
      { icon: Sparkles, label: 'Effects', from: 0, count: FX_ROWS },
      { icon: Film, label: 'Footage', from: CLIPS_AT, count: CLIP_ROWS },
      {
        icon: ChatBubbleBottomCenterText,
        label: 'Captions',
        from: CAPTIONS_AT,
        count: CAPTION_ROWS
      },
      { icon: MusicalNote, label: 'Audio', from: AUDIO_AT, count: AUDIO_ROWS }
    ].map((band) => {
      const last = band.from + band.count - 1;
      const top = rowTops[band.from] ?? 0;
      return { ...band, top, height: (rowTops[last] ?? top) + laneHeight(last) - top };
    })
  );

  /** Where a lane's top edge sits, counting from the clips lane at zero. */
  const laneTop = (row: number) => rowTops[row] ?? LANE_INSET;

  /** How tall that lane is, which now depends on what lives in it. */
  const laneHeight = (row: number) => LANE_HEIGHTS[rows[row] ?? 'caption'];

  /** Which rows a kind of block is allowed in. */
  function bandOf(kind: Kind): { from: number; count: number } {
    if (kind === 'fx') return { from: 0, count: FX_ROWS };
    if (kind === 'clip') return { from: CLIPS_AT, count: CLIP_ROWS };
    if (kind === 'caption') return { from: CAPTIONS_AT, count: CAPTION_ROWS };
    return { from: AUDIO_AT, count: AUDIO_ROWS };
  }

  /**
   * Which lane a pointer is over, within the rows its kind is allowed.
   *
   * Clamped rather than free: a clip dragged down into the caption rows means
   * nothing, and letting the block follow the pointer there would be showing
   * something that can't be committed.
   */
  function laneAt(clientY: number, kind: Kind): number {
    if (!lane) return 0;
    const band = bandOf(kind);
    const box = lane.getBoundingClientRect();
    const y = clientY - box.top;

    // Walked rather than divided: the rows aren't all the same height any more,
    // so there is no pitch to divide by.
    let nearest = band.from;
    let closest = Infinity;
    for (let row = band.from; row < band.from + band.count; row += 1) {
      const middle = rowTops[row] + laneHeight(row) / 2;
      const distance = Math.abs(y - middle);
      if (distance < closest) {
        closest = distance;
        nearest = row;
      }
    }
    return nearest - band.from;
  }

  /**
   * How near either end of the window a dragged block has to get before the
   * strip starts pulling itself along, and how fast it goes at the very edge.
   *
   * Speed ramps with depth into the zone rather than switching on, so easing
   * towards the edge creeps and shoving into it moves.
   */
  const EDGE_ZONE = 100;
  const EDGE_SPEED = 16;

  /**
   * How close a dragged edge has to come to something before it takes its
   * value, in pixels.
   *
   * In pixels rather than seconds because it's a property of the hand, not of
   * the clip: the distance at which you meant to line two things up is however
   * far the pointer wobbles, and that doesn't change when the strip does.
   */
  const SNAP_PX = 7;

  let lane = $state<HTMLElement>();
  /** The window onto the strip, which is wider than it for all but a short clip. */
  let scroller = $state<HTMLElement>();

  /**
   * How much width a second gets, and the only thing zooming changes.
   *
   * Everything else on the strip is a proportion of the duration, so widening a
   * second widens the blocks, the ruler and the playhead together without any
   * of them knowing about it. The two exceptions are the things that are
   * genuinely measured in pixels rather than seconds — how close a snap has to
   * be, and whether a block can carry its name — and both read this.
   */
  /**
   * The zoom you chose, and the zoom actually used.
   *
   * They differ when the clip gets shorter under a scale that was set for a
   * longer one — delete the last bed and the strip keeps its old rate, so it
   * stops two thirds of the way across the window with nothing after it. The
   * fit runs once, deliberately, so it can't put it right either.
   *
   * Floored at "the whole clip fills the window", so the strip is never
   * narrower than the thing it is drawn in. Zooming in still does whatever you
   * ask; only winding out past the point of showing everything is refused,
   * which was already true of the wheel.
   */
  let chosenZoom = $state(STRIP_PX_PER_SECOND);

  /*
   * Open showing the whole clip.
   *
   * A fixed rate meant landing on a view of the first eight seconds of a
   * minute-long edit, with the rest off to the right and nothing saying so. The
   * first thing anyone wants to know is the shape of the whole thing.
   *
   * Once only. After that the scale is the person's, and re-fitting it because
   * a caption moved would be taking it back off them.
   */
  let fitted = false;
  $effect(() => {
    // Not until there is something to fit. An empty clip measures a tenth of a
    // second — the floor `clipLayout` returns rather than a real length — and
    // fitting the window to that pins the zoom at its maximum, so the first
    // thing placed afterwards arrives on a strip showing a second and a half of
    // itself. The fit only gets one chance, so it has to wait for a real one.
    /*
     * `hasContent` rather than a length, now that an empty strip has one.
     *
     * The guard was `visible <= 0.2`, which meant the same thing only while
     * nothing on the strip could be long without being real. An empty strip is
     * twenty seconds now, so measuring it would spend the one fit on a span
     * nobody chose — and the first clip placed afterwards would arrive on a
     * strip showing a fraction of itself, which is the very thing this waits to
     * avoid.
     */
    if (fitted || windowWidth <= 0 || !hasContent || visible <= 0.2) return;
    fitted = true;
    // The clip, not the clip plus the room after it. Fitting the canvas spent a
    // fourteenth of the window on empty strip and made that the furthest out
    // anyone could go; the room is for dragging into, and it's a scroll away.
    chosenZoom = Math.min(MAX_ZOOM, Math.max(minZoom, windowWidth / Math.max(visible, 0.1)));
  });

  const MAX_ZOOM = 800;

  /**
   * How far out you can go: always at least far enough to see the whole clip.
   *
   * A fixed floor was wrong for exactly the clips that need it — a minute of
   * footage at twenty pixels a second is still wider than the window, so the
   * end stayed out of reach no matter how far you scrolled the wheel. The
   * floor has to know how long the clip is and how wide the window is.
   */
  /**
   * Zooms about the pointer, so whatever is under it stays under it.
   *
   * Anchoring on the left edge instead is the version everyone writes first and
   * nobody can use: you zoom in to look at something and it leaves the screen.
   */
  function zoom(e: WheelEvent) {
    const box = scroller;
    if (!box || e.deltaY === 0) return;
    // Shift and a wheel is how a trackpad says "sideways" — leave it alone, it
    // already does the useful thing here.
    if (e.shiftKey) return;

    e.preventDefault();

    const rect = box.getBoundingClientRect();
    const offset = e.clientX - rect.left;
    const at = (box.scrollLeft + offset) / pxPerSecond;

    const factor = Math.exp(-e.deltaY * 0.002);
    const next = Math.min(MAX_ZOOM, Math.max(minZoom, pxPerSecond * factor));
    if (next === pxPerSecond) return;

    chosenZoom = next;

    // Set after the width has been applied, or the container clamps the scroll
    // to a width it hasn't grown into yet.
    requestAnimationFrame(() => {
      box.scrollLeft = Math.max(0, at * next - offset);
    });
  }

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
    /**
     * How far either edge may travel, in absolute timeline seconds.
     *
     * Every kind of block runs out of room for a different reason and they all
     * have to be said in the same units. A bed can only play the audio it has,
     * from where it's cued in to the end of the song — stretching it past that
     * used to be allowed, and the renderer covered by looping the file, so a
     * two-second sting dragged to twenty played ten times over. A clip can only
     * give back the footage it was trimmed from. A caption is only bounded by
     * the clip, because text lasts as long as it's asked to.
     */
    minStart: number;
    maxEnd: number;
    /**
     * Where the *material* runs out, as opposed to where the strip does.
     *
     * Two very different refusals wearing one number. The strip stopping is a
     * drawing decision and gives way the moment you push against it; a clip
     * running out of footage or a bed out of song does not, however hard anyone
     * drags. Only the first may be stretched.
     */
    limit: number;
  }

  type Grip = 'move' | 'start' | 'end';
  type Kind = 'caption' | 'audio' | 'clip' | 'fx';

  /*
   * The drag in progress, as an overlay on the committed values.
   *
   * Held separately rather than mutating the source: the parent owns those, and
   * writing on every pointermove would be a save per pixel. The lanes read
   * through this while a drag is live and from the props otherwise.
   */
  let drag = $state<{
    kind: Kind;
    key: number;
    grip: Grip;
    /** Where the pointer went down, in seconds. */
    from: number;
    /** The block as it was before this gesture. */
    was: Span;
    /** Live value, shown while the pointer is down. */
    now: Span;
    /** The lane it's currently over, for a block being moved. */
    lane: number;
    /**
     * The furthest this gesture may reach.
     *
     * Starts a little past the end and then keeps a margin ahead of the pointer
     * — so pushing right makes more timeline for as long as you keep pushing,
     * and holding at the edge lets the edge-pull carry you further still.
     *
     * Ahead of the *pointer*, deliberately, and not ahead of the block. Ahead
     * of the block is a loop with a motor in it: the block follows the pointer
     * into the new space, its end moves out, more room appears beyond that, and
     * it runs away at sixteen pixels a frame whether or not anyone is asking.
     * The pointer only moves when a hand moves it.
     */
    ceiling: number;
    /**
     * Whether everything after this block is coming with it.
     *
     * Held on the gesture rather than read from the event each time, because a
     * modifier can be let go halfway through a drag and half a ripple is not a
     * thing anyone means.
     */
    ripple: boolean;
  } | null>(null);

  /**
   * How much timeline to draw, as opposed to how long the clip is.
   *
   * `duration` is the render: the furthest a picture reaches, which is what
   * comes out the other end. But a bed can run past the last shot and a block
   * can be dragged beyond the end, and a strip that stopped at the render's
   * length simply cut those off — the bed disappeared over the edge with
   * nothing to say where it had gone.
   *
   * The live drag is in here too, so dragging something past the end grows the
   * strip under it rather than running it off the side.
   */
  /**
   * Whether anything has been put on the strip yet.
   *
   * Not the same question as "how long is it", and the difference matters in
   * two places: the strip is given a working span when it is empty, and the
   * fit-to-window must not spend its one chance measuring that span. Effects
   * count — a clip whose footage has been removed but which still carries a
   * tear on the chorus is not an empty clip.
   */
  const hasContent = $derived(
    clips.length > 0 || captions.length > 0 || tracks.length > 0 || effects.length > 0
  );

  /**
   * What an empty strip is worth, in seconds.
   *
   * With nothing on it there is no natural length, and a strip of zero seconds
   * is zero pixels wide: nothing to see, and nowhere to double-click to make
   * the first thing. Twenty is about as long as a clip of this kind runs, so an
   * empty one is roughly the shape of a finished one. The moment anything lands
   * the content decides and this is never consulted again.
   */
  const EMPTY_SPAN = 20;

  const contentEnd = $derived(
    Math.max(
      hasContent ? 0 : EMPTY_SPAN,
      duration,
      ...clips.map((c) => c.end),
      /*
       * Where a bed *starts*, as well as where it ends.
       *
       * A bed with no end of its own means "until the clip does", so it can't
       * be counted towards the length — but its start is a real position, and
       * one placed past everything else was drawn beyond the right-hand edge of
       * a strip that had no reason to reach it. Off screen, unscrollable, and
       * undraggable: a block that exists and cannot be got at.
       */
      ...tracks.map((t) => Math.max(t.start, t.end ?? 0)),
      ...captions.map((c) => c.end)
    )
  );

  /**
   * How long the strip is — and, on a drop, held open until the save lands.
   *
   * Letting go is not the end of the gesture as far as the strip is concerned:
   * the block's new position takes a round trip to the server and back, and
   * between the release and the reload the props still describe the old,
   * shorter clip. Derived from them alone, the strip collapsed for those few
   * frames — and the scroller, clamped to a strip that had just got shorter,
   * had no way back to where you were looking. The drop appeared to be undone.
   *
   * `let`, not `const`, because a derived can be overridden: `finish` assigns
   * the dropped block's end here, and Svelte holds that value until one of the
   * dependencies below actually changes — which is exactly when the new data
   * arrives. No latch to clear and no effect watching for the moment to clear
   * it; shortening or deleting something still shrinks the strip on the very
   * next recalculation.
   */
  /*
   * Effects reach the strip but not the clip.
   *
   * They were counted in `contentEnd`, which was wrong in the way that matters:
   * that number is how long the clip *is*, and an effect cannot make it any
   * longer. The render agrees and always has — it works the length out from the
   * captions and the beds, because a caption still on screen or a bed still
   * playing is a reason for the clip to keep going, and an instruction about a
   * picture that has already ended is not. A block dragged past the last frame
   * simply does nothing out there.
   *
   * But it still has to be reachable. Left out of the strip's extent entirely,
   * an effect placed beyond everything else is drawn past the right-hand edge
   * of a strip with no reason to go there: off screen, unscrollable, and
   * undraggable — the same trap the beds are in `contentEnd` to avoid. So it
   * lands here instead, where the strip is measured rather than the clip.
   */
  let visible = $derived(
    Math.max(contentEnd, ...effects.map((fx) => fx.end ?? 0), drag ? drag.now.end : 0)
  );

  let windowWidth = $state(0);

  /**
   * How far out you can go: far enough that the clip itself fills the window.
   *
   * Measured against the content, not the canvas. The canvas runs past the end
   * so there's somewhere to drag into, and letting that set the floor kept the
   * emptiest part of the strip permanently on screen — the clip could never
   * fill the frame, however far you wound the wheel back.
   */
  const minZoom = $derived(
    windowWidth > 0 ? Math.min(20, windowWidth / Math.max(visible, 0.1)) : 20
  );

  /** The zoom actually used: yours, or enough to fill the window, whichever
      is larger. See `chosenZoom`. */
  const pxPerSecond = $derived(Math.max(chosenZoom, minZoom));

  /**
   * Room past the end, but only while something is being dragged into it.
   *
   * Everything that places a block clamps it to the strip, so with the strip
   * ending exactly where the last block does there is nowhere to drag *to* and
   * the clip can never be made longer. Standing room fixed that and left the
   * strip permanently trailing off into empty time, which reads as part of the
   * clip and isn't.
   *
   * So it appears when it's wanted and not before: a fixed span of pixels
   * — not a share of the clip, which would be a gulf on a long one — and only
   * once the gesture has actually moved something, so grabbing a block that
   * already sits at the end doesn't make the strip jump under the hand.
   */
  /**
   * The furthest anything may be dragged to.
   *
   * Not `canvas`, which is only what gets drawn, and which is the old end until
   * a gesture is under way. A span is captured when you press — so an edge
   * grip's `maxEnd` was decided before the room existed, and the right-hand
   * handle could never reach past the end even though moving the whole block
   * could. Same eighty pixels, but from a value that is true before the gesture
   * starts as well as during it.
   *
   * Safe to derive from `visible` even though `visible` follows the live drag:
   * spans are read once, at pointerdown, so this cannot chase itself.
   */
  const reach = $derived(visible + 80 / pxPerSecond);

  /*
   * The room appears when you take hold, not once you have already moved.
   *
   * Waiting for movement was a deadlock: `secondsAt` clamps the pointer to the
   * strip, the strip ended at the content, and at a zoom that fits the clip
   * there is no screen to the right of it either — so the pointer could not
   * name a time past the end, the block could not move, and the room that would
   * have let it never arrived. Eighty pixels at the moment of grabbing costs a
   * small shift on a block already at the end, and is the only thing that
   * breaks the circle.
   */
  const canvas = $derived(drag ? Math.max(visible, drag.ceiling) : visible);

  const stripWidth = $derived(canvas * pxPerSecond);

  /**
   * An effect's span, which is a caption's for the same reason.
   *
   * Nothing runs out. An effect is an instruction rather than a piece of
   * material, so there is no reel of it to reach the end of — it can be
   * stretched across the whole clip or squeezed onto one frame, and the only
   * bound is the strip itself. An unplaced effect reads as the whole clip,
   * which is what dragging one out of the Look panel would mean.
   */
  const fxSpan = (fx: PlacedEffect): Span => ({
    start: fx.start ?? 0,
    end: fx.end ?? duration,
    openEnded: false,
    minStart: 0,
    maxEnd: reach,
    limit: Infinity
  });

  const captionSpan = (c: TimedCaption): Span => ({
    start: c.start,
    end: c.end,
    openEnded: false,
    minStart: 0,
    maxEnd: reach,
    // A caption is words; there is no reel of them to run out of.
    limit: Infinity
  });

  /**
   * How far this gesture may push the end.
   *
   * The strip's own edge follows the pointer while you drag, so a span's
   * `maxEnd` — fixed when you pressed — is not the last word. The material's is.
   */
  const stretchTo = (span: Span) =>
    Math.min(span.limit, drag ? Math.max(span.maxEnd, drag.ceiling) : span.maxEnd);

  const trackSpan = (t: TimelineTrack): Span => {
    /*
     * "Until the clip does" — unless it starts after the clip has already
     * finished, in which case that is a length of less than nothing.
     *
     * A bed placed past the end collapsed to the minimum width: a sliver a
     * fraction of a pixel wide, too small to read, grab or drag back. Drawn at
     * the length it would play instead, it is a block again. The render still
     * ignores it, because it still cannot be heard.
     */
    const spare = t.length > 0 ? Math.max(MIN_SPAN, t.length - t.seek) : duration;
    const end = t.end ?? (t.start < duration ? duration : t.start + spare);
    // What's left of the file once it's been cued in. Unknown lengths get the
    // clip's own, which is the old behaviour and no worse than it was.
    const available = spare;
    return {
      start: t.start,
      end,
      openEnded: t.end === null,
      // Only as far back as there is song in front of the cue point — the same
      // limit a clip's head has, and for the same reason: pulling the edge out
      // reveals what was cut, and there is nothing before the beginning.
      minStart: Math.max(0, t.start - t.seek),
      maxEnd: Math.min(reach, t.start + available),
      limit: t.start + available
    };
  };

  const clipSpan = (c: TimelineClip): Span => ({
    start: c.start,
    end: c.end,
    openEnded: false,
    minStart: c.start - c.headroom,
    maxEnd: c.end + c.tailroom,
    // Only as much picture as was shot.
    limit: c.end + c.tailroom
  });

  /**
   * How far a ripple has carried everything that starts at or after the block
   * being dragged. Zero unless one is under way.
   */
  const rippleShift = (start: number) =>
    drag?.ripple && start >= drag.was.start - 0.001 ? drag.now.start - drag.was.start : 0;

  /**
   * What a lane should draw: the live drag, the ripple following it, or the
   * truth.
   *
   * The followers move on screen while the hand is still down, rather than
   * jumping into place on release — a ripple you cannot see until it is done is
   * a thing you have to undo to understand.
   */
  function shown(kind: Kind, key: number, span: Span): Span {
    if (drag && drag.kind === kind && drag.key === key) return drag.now;
    const shift = rippleShift(span.start);
    return shift ? { ...span, start: span.start + shift, end: span.end + shift } : span;
  }

  const percent = (seconds: number) => `${(seconds / canvas) * 100}%`;

  /**
   * The narrowest a block may be drawn, in pixels.
   *
   * Width is a share of the strip, so at a zoom that fits a six-minute clip a
   * two-second caption is a few pixels and a half-second one is a hair. The
   * floor was in *seconds*, which is no floor at all — 0.05s is a sixth of a
   * pixel wound out that far. Enough here for two edges and something to press
   * between them, so every block stays a thing you can hit.
   */
  /**
   * Pressing a control on a block, without the block's row losing its keys.
   *
   * `stopPropagation` keeps the press off the strip, which would otherwise
   * start a pan. `preventDefault` keeps the focus off the button, and that is
   * the part that matters: focus landing on a tool and staying there meant
   * Space activated that tool instead of playing — press Remove and then Space
   * and the undo in the toast fired, putting the block back — while Delete and
   * the transport keys stepped aside because the focused element was a button.
   *
   * The click still fires; only the focus is suppressed. A keyboard user tabs
   * to the button and presses it as normal, because none of this runs unless
   * there is a pointer.
   */
  function pressTool(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /*
   * Not for anything you type in.
   *
   * A caption's words are edited on the block, in a real `<input>`, and
   * `preventDefault` on the press is what stops an input taking focus — so
   * giving the field the same handler as the buttons beside it meant you could
   * no longer click into it to write. It wants the press kept off the strip and
   * nothing else.
   */

  const MIN_BLOCK_PX = 30;

  /**
   * The narrowest a burst is drawn at, which is however wide its name is.
   *
   * A burst lasts a sixth of a second, so its true width is a pixel or two at
   * any usable zoom, and a block nobody can read is one you have to open to
   * identify. Thirty is the floor for blocks you can also resize, where the
   * handles are most of what has to fit; a burst has none, so all of this is
   * the name.
   *
   * It does mean the block is drawn wider than the effect lasts — already true
   * of every short block on the strip, and the right trade for the same reason:
   * a mark you can read, a few pixels wider than the thing it stands for, beats
   * an accurate one you cannot see.
   */
  const MIN_BURST_PX = 72;

  /**
   * The narrowest a caption block gets, which is wider than the rest.
   *
   * A caption is the one block with something on it at every width — the cog,
   * and the handles either side of it. Thirty pixels can't hold them, and a
   * button drawn outside the box it belongs to looks like a rendering fault
   * rather than a short caption.
   */
  const MIN_CAPTION_PX = 56;

  /**
   * Which anchor a caption is on, as a position in the cycle.
   *
   * A caption that has never been moved is on the default one, so the icon
   * shows where the line really is rather than an empty state.
   */
  function anchorOf(caption: TimedCaption): number {
    const at = anchors.findIndex((a) => a.id === captionAnchorOf(caption));
    return at === -1 ? anchors.findIndex((a) => a.id === DEFAULT_ANCHOR) : at;
  }

  /*
   * How a line break looks while you are typing it.
   *
   * A caption is stored with a real newline in it, which is what the render
   * wants and what the preview draws — but the field on a block is an
   * `<input>`, and an input cannot hold one at all. So the break is shown as a
   * character on the way in and turned back on the way out. Shift+Enter puts
   * one in, and typing the bar does the same thing, which is how someone who
   * never hears about Shift+Enter finds it anyway.
   *
   * A pipe because it looks like what it does, and because nobody has ever
   * wanted one in a caption.
   */
  /*
   * One size and one weight for every button on a block.
   *
   * They were set one at a time as each was drawn — 17 here, 19 there, four
   * different stroke widths — which is invisible while you write it and the
   * first thing you see in a row of five.
   *
   * 1.5 because that is what Heroicons' outline set draws at, and the icons
   * this file draws itself have to sit beside the ones it imports. At 2 they
   * were quietly bolder than their neighbours, which reads as a different size
   * rather than a different weight.
   */
  const ICON = 17;
  const STROKE = 1.5;

  const BREAK = '|';
  const typed = (text: string) => text.replace(/\n/g, BREAK);
  const written = (text: string) => text.replace(/\|/g, '\n');

  /**
   * Top, middle, bottom, round again. Three places is a cycle, not a menu.
   *
   * Stores the anchor's name, not its height — the height belongs to the dial
   * in Advanced, and a caption that had copied the number stopped following it.
   * The old `y` goes with it, so nothing is left behind to disagree.
   */
  function cycleAnchor(index: number) {
    const next = anchors[(anchorOf(captions[index]) + 1) % anchors.length];
    oncaptions(captions.map((c, i) => (i === index ? { ...c, anchor: next.id, y: undefined } : c)));
  }

  /**
   * Whether a block is wide enough to carry its name as well as its timings.
   *
   * Measured from the data rather than the element: a block's width in pixels
   * is its length times the strip's fixed rate, so this is known before
   * anything is drawn and needs no container query to find out.
   */
  const roomForBoth = (span: Span) => (span.end - span.start) * pxPerSecond >= 108;

  /**
   * Whether a caption is wide enough to write in rather than just read.
   *
   * Higher than `roomForBoth`, because a field needs more than a label does: a
   * handle, a cursor and enough of the sentence to see what you are editing. At
   * the lower threshold there was room for about four characters, which is a
   * text field in the same sense that a keyhole is a window.
   */
  const roomToType = (span: Span) => (span.end - span.start) * pxPerSecond >= 170;

  /**
   * Whether a block can carry its own controls, or has to hand them to a dialog.
   *
   * One line, not a sequence of them. Dropping the buttons one at a time as a
   * block narrows sounds tidier and isn't: there is no order in which the last
   * one standing is the one you wanted, and a band where the colour had gone
   * but the cog that holds it hadn't arrived yet is a caption you cannot colour
   * at all. Five buttons in forty pixels didn't shrink to fit either — they
   * spilled out over whatever was beside them, so a short caption looked like a
   * broken long one.
   *
   * A block a second and a half long at a zoom that shows the whole clip is
   * normal, not an edge case, so the dialog is a real place rather than a
   * fallback — and zooming in still brings the buttons back.
   *
   * The numbers are measured, not guessed. Everything on a block is 32 wide
   * with its margin, the trim handles are 8 each, and a shot's thumbnail is 48:
   * a caption open is a grip, four tools and the button that opened them, which
   * is 208 before a single letter is drawn. Guessed at 130 they didn't shrink
   * to fit, they hung off the end — which is why blocks looked like their
   * background had stopped short of their buttons.
   */
  /**
   * How the tools come and go.
   *
   * Sideways, because that is the direction they take up room in: a group
   * appearing at full width shoves the label out of the way in one frame, and
   * the eye reads that as the block changing rather than as tools arriving.
   * Short enough not to be a wait — this happens every time you look at a
   * block, not once.
   */
  const SLIDE = { axis: 'x' as const, duration: 160, easing: cubicOut };

  /*
   * How a time is written on a block, wherever it is written.
   *
   * One value, because a bed's times and a caption's are the same kind of fact
   * and were coming out at three different strengths — 45, 70, and full where a
   * block had no name to compete with. Dimmer than the name it sits beside, so
   * the eye lands on the words first, but only just: at 70 they were reading as
   * disabled rather than as secondary.
   */
  const TIME = 'shrink-0 tabular-nums opacity-85';
  /** And the rarer question beside it — which part of the file this is. */
  const RANGE = 'shrink-0 tabular-nums opacity-60';

  const TOOL_PX = 32;
  const TRIMS_PX = 16;
  const CHROME_PX = {
    // Five: fade in, fade out, mute, remove, and the button that opened it.
    clip: TRIMS_PX + 48 + 5 * TOOL_PX,
    /*
     * Five: height, size, effect, remove, and the button that opened the
     * drawer.
     *
     * Colour and backdrop used to be in here as well and have gone to the
     * dialog, where they were all along. What a drawer is for is the thing you
     * reach for while arranging — where a caption sits and how big it is, which
     * you judge against the picture and change again immediately. A colour is a
     * decision you make once and leave, and it was costing two of the seven
     * slots and a fifth of the width a block needed before its tools would
     * open at all.
     */
    caption: TRIMS_PX + 5 * TOOL_PX,
    audio: TRIMS_PX + 6 * TOOL_PX
  } as const;

  /** Room for the tools and for enough of the block's name to know what it is. */
  const roomForTools = (kind: keyof typeof CHROME_PX, span: Span) =>
    (span.end - span.start) * pxPerSecond >= CHROME_PX[kind] + 60;

  /**
   * Which block has its tools out, if any.
   *
   * One at a time, deliberately. The strip's job is to show a whole edit at
   * once, and five blocks with their settings open is the crowded row this was
   * meant to get rid of. Opening one puts the last one away.
   */
  let tools = $state<{ kind: 'clip' | 'caption' | 'audio'; key: number } | null>(null);

  /**
   * Whether this block's tools are out — and still fit.
   *
   * The room was checked when the drawer was opened and then never again, so
   * dragging a block narrower while its tools were out left five buttons
   * hanging past the end of a block ten pixels wide, over whatever happened to
   * be next to it. Asking again on every draw means the drawer puts itself away
   * when the block can no longer hold it, and comes back if you drag it wide
   * again — which is what you would expect of a thing that is only ever shown
   * because there was space for it.
   *
   * The span is the one being drawn rather than the one stored, so it follows a
   * drag in progress instead of waiting for the drop.
   */
  const toolsOut = (kind: 'clip' | 'caption' | 'audio', key: number, span?: Span) =>
    tools?.kind === kind && tools.key === key && (!span || roomForTools(kind, span));

  /**
   * The button every block ends with.
   *
   * Slides the tools out where there is room for them, and opens the dialog
   * where there isn't — the same gesture either way, so nobody has to know
   * which of the two they are about to get.
   */
  function toggleTools(kind: 'clip' | 'caption' | 'audio', key: number, span: Span) {
    if (!roomForTools(kind, span)) {
      opened = { kind, key };
      return;
    }
    tools = toolsOut(kind, key) ? null : { kind, key };
  }

  /** The block whose dialog is open, when the block itself had no room. */
  let opened = $state<{ kind: 'clip' | 'caption' | 'audio' | 'fx'; key: number } | null>(null);

  /** Where a pointer is on the strip, in seconds. */
  function secondsAt(clientX: number): number {
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    const fraction = (clientX - box.left) / box.width;
    return Math.min(canvas, Math.max(0, fraction * canvas));
  }

  const snapWindow = $derived(SNAP_PX / pxPerSecond);

  /**
   * Everything a dragged edge can line up with: the ends of the clip, and the
   * edges of every other block.
   *
   * Deliberately not the playhead. It follows whatever is being dragged now, so
   * offering it as a target would be offering the block its own position — it
   * would stick to itself and never come loose.
   */
  const snapTargets = $derived.by(() => {
    const targets = [0, duration, visible];

    /*
     * Clips first, because butting one against the end of another is the snap
     * that matters most now that they can sit anywhere. Leaving them out was an
     * oversight from when the timeline had no clips lane — everything else was
     * offered and they weren't, so a clip had nothing to line up with.
     */
    for (const clip of clips) {
      if (drag?.kind === 'clip' && drag.key === clip.id) continue;
      targets.push(clip.start, clip.end);
    }

    captions.forEach((c, index) => {
      if (drag?.kind === 'caption' && drag.key === index) return;
      targets.push(c.start, c.end);
    });

    for (const track of tracks) {
      if (drag?.kind === 'audio' && drag.key === track.id) continue;
      targets.push(track.start, track.end ?? duration);
    }

    // Effects line up with the cut they were put there for, which is the whole
    // reason anyone drags one to a particular second.
    effects.forEach((fx, index) => {
      if (drag?.kind === 'fx' && drag.key === index) return;
      targets.push(fx.start ?? 0, fx.end ?? duration);
    });

    return targets;
  });

  /**
   * The ruler, spaced by how much room a second has rather than by how long the
   * clip is.
   *
   * Zoomed out, a line per second is a grey wash; zoomed in, a line per ten is
   * no help at all. Stepping through familiar intervals keeps the marks about
   * sixty pixels apart at any scale, and keeps them on numbers a person counts
   * in — never 2.5 seconds, or 7.
   */
  const ticks = $derived.by(() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = steps.find((n) => n * pxPerSecond >= 60) ?? steps[steps.length - 1];
    const out: number[] = [];
    for (let t = step; t < visible; t += step) out.push(Math.round(t * 100) / 100);
    return out;
  });

  /** Where a snap landed, so the strip can show what it lined up with. */
  let snapLine = $state<number | null>(null);

  /** The nearest thing worth lining up with, or null if nothing is close. */
  function nearest(value: number): number | null {
    let best: number | null = null;
    let closest = snapWindow;
    for (const target of snapTargets) {
      const distance = Math.abs(target - value);
      if (distance < closest) {
        closest = distance;
        best = target;
      }
    }
    return best;
  }

  /**
   * Tenths, for a drag.
   *
   * Not a limit on what a time can be — the fields accept finer, and a music
   * bed cued to a beat may well want it. It's the limit of what a drag can
   * mean: a hundredth of a second is a fifth of a pixel on this strip, so
   * anything past a tenth would be recording the noise in someone's hand.
   */
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

  /**
   * The last time we saw the player report, so the loop can tell its own motion
   * from ours.
   *
   * The timeline can be longer than the video that is standing in for it — a
   * bed running past the last shot, or an edit changed since the render — and a
   * `<video>` clamps any seek to its own length. Assigning the player's time
   * every frame meant a scrub past the end of the render was overwritten by the
   * clamp before it could be drawn: the playhead stopped at the end of a *file*
   * while the strip carried on. Now the player only moves the playhead when the
   * player is the thing that moved.
   */
  let lastFromPlayer = -1;

  $effect(() => {
    const player = video;
    if (!player) return;

    let frame = 0;
    const follow = () => {
      const at = player.currentTime;
      if (at !== lastFromPlayer) {
        lastFromPlayer = at;
        playhead = at;
      }
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
  /** Brings the playhead back into the window if it has left it. */
  /**
   * What the scroller is showing, in seconds, so the minimap can draw it.
   *
   * Read from a scroll listener rather than derived: `scrollLeft` is the
   * browser's state, not ours, and it moves for reasons this component never
   * hears about — a wheel, a trackpad, the edge pull, a jump to the playhead.
   */
  let viewFrom = $state(0);
  let viewWidth = $state(0);

  $effect(() => {
    const box = scroller;
    if (!box) return;

    const measure = () => {
      viewFrom = box.scrollLeft / pxPerSecond;
      viewWidth = box.clientWidth / pxPerSecond;
    };
    measure();

    box.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      box.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  });

  /**
   * Where the overview says to go.
   *
   * One answer doing both jobs: the playhead goes there and the strip follows
   * it. Panning and seeking are the same wish at this scale — nobody drags a
   * four-minute clip's overview to look at a place they don't then want to be.
   */
  function scrubTo(at: number) {
    playhead = at;
    if (video) {
      // Only as far as the file goes; the playhead itself is free to go further.
      video.currentTime = Math.min(at, video.duration || at);
      lastFromPlayer = video.currentTime;
    }

    const strip = scroller;
    if (strip) strip.scrollLeft = Math.max(0, at * pxPerSecond - strip.clientWidth / 2);
  }

  function followPlayhead() {
    const box = scroller;
    if (!box) return;
    const x = playhead * pxPerSecond;
    const margin = 40;
    if (x < box.scrollLeft + margin || x > box.scrollLeft + box.clientWidth - margin) {
      box.scrollTo({ left: Math.max(0, x - box.clientWidth / 2), behavior: 'smooth' });
    }
  }

  $effect(() => {
    // Read so the effect re-runs as it moves; the work is in followPlayhead.
    void playhead;
    if (drag || panning || !playing) return;
    followPlayhead();
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
  /**
   * Puts a new caption where you double-clicked.
   *
   * The third gesture on bare strip, after click-to-seek and drag-to-pan, and
   * the only one left that can't be mistaken for either — a double-click has
   * already seeked twice by the time it fires, so the playhead is sitting where
   * the caption lands.
   *
   * Four seconds, or whatever is left of the clip: long enough to read and to
   * grab by either edge afterwards.
   */
  /**
   * Long enough to write in, whatever the zoom.
   *
   * Four seconds was a sentence's worth of clip and, wound out to see a whole
   * edit, forty pixels of block — too narrow for the field that is the point of
   * making one. Measured in pixels and converted back, with a floor so it is
   * never shorter than a caption wants to be and a ceiling so a distant zoom
   * doesn't lay down half a minute of it.
   */
  function newCaptionLength(): number {
    return Math.max(4, Math.min(15, 210 / pxPerSecond));
  }

  /**
   * Which band a pointer is in, ignoring what is being dragged.
   *
   * `laneAt` answers a different question — where may *this* block go — and
   * clamps to the band it is already allowed in. Making something new has no
   * block yet, so it needs the row under the pointer as it actually is.
   */
  function rowAt(clientY: number): number {
    if (!lane) return 0;
    const y = clientY - lane.getBoundingClientRect().top;
    let nearest = 0;
    let closest = Infinity;
    rowTops.forEach((top, row) => {
      const distance = Math.abs(y - (top + laneHeight(row) / 2));
      if (distance < closest) {
        closest = distance;
        nearest = row;
      }
    });
    return nearest;
  }

  /**
   * A new effect where you double-clicked, the length the zoom suggests.
   *
   * Shorter than a new caption's, because the two are wanted for different
   * spans: a caption is a sentence somebody reads, an effect is usually a
   * moment — a tear on the beat, a glitch over one shot. Long is easier to drag
   * shorter than short is to find, so this errs high, but not by much.
   */
  /**
   * How long a new block of this effect should be.
   *
   * The effect's own answer when it has one — a tear knows it lasts a sixth of
   * a second and the strip has no way to guess that. Otherwise a length that
   * suits the zoom, floored and capped so a distant view doesn't lay down half
   * a minute and a close one doesn't lay down a sliver.
   */
  function fxLength(effect: (typeof PICTURE_EFFECTS)[number]): number {
    if (effect.seconds) return effect.seconds;
    return Math.max(1, Math.min(6, 140 / pxPerSecond));
  }

  function addFxHere(e: MouseEvent) {
    // The first picture effect there is, so the block says something the moment
    // it exists rather than reading as blank until you have been into it.
    const first = PICTURE_EFFECTS[0];
    if (!first) return;
    const start = snap(secondsAt(e.clientX));
    const end = Math.min(canvas, start + fxLength(first));
    if (end <= start) return;
    opened = { kind: 'fx', key: effects.length };
    // The row you double-clicked in, so a block lands where you asked for it.
    const lane = Math.min(FX_ROWS - 1, Math.max(0, rowAt(e.clientY)));
    oneffects?.([...effects, { id: first.id, start: tidy(start), end: tidy(end), lane }]);
  }

  function addCaptionHere(e: MouseEvent) {
    /*
     * Empty strip only.
     *
     * The handler sits on the lane so that a double-click anywhere free makes a
     * caption there, and a click inside a block reaches it too — double-clicking
     * a caption's own field to select the word you'd mistyped wrote a second
     * caption underneath it.
     */
    if ((e.target as HTMLElement | null)?.closest('[data-block]')) return;

    // The top row makes an effect instead. Every other row goes on making a
    // caption, including the ones that hold clips and beds — those come from
    // files rather than from a gesture, so the row is free to mean this.
    if (rowAt(e.clientY) < CLIPS_AT) {
      if (oneffects) addFxHere(e);
      return;
    }

    const start = snap(secondsAt(e.clientX));
    const end = snap(Math.min(canvas, start + newCaptionLength()));
    if (end - start < MIN_SPAN) return;

    // Focused as soon as it exists: making one is wanting to write in it, and
    // the alternative is drawing a box and then having to go and click it.
    focusCaption = captions.length;
    pickedCaption = captions.length;
    oncaptions([...captions, { start: tidy(start), end: tidy(end), text: '' }]);
  }

  /**
   * The caption whose field should take the cursor once it arrives.
   *
   * A round trip away: the new caption is saved by the page and comes back as a
   * prop, so there is nothing to focus at the moment it's asked for. The effect
   * below runs again when the list changes and catches it then.
   */
  let focusCaption = $state<number | null>(null);

  $effect(() => {
    const want = focusCaption;
    // Read, so this runs again when the new caption lands.
    captions.length;
    if (want === null) return;

    const field = lane?.querySelector<HTMLInputElement>(`[data-caption="${want}"]`);
    if (!field) return;
    field.focus();
    focusCaption = null;
  });

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

  /**
   * The keys an editor is expected to answer to.
   *
   * Space plays, because it is the only shortcut everyone already knows and its
   * absence is felt on the first clip. The arrows step, because a drag can't
   * hit a hundredth of a second and lining a bed up against a beat wants one —
   * shift takes a whole second for getting somewhere, bare takes a tenth for
   * getting it right.
   *
   * Ignored while typing, and while a button has focus: space is that button's
   * key then, and stealing it would break the tab order for the sake of a
   * shortcut.
   */
  $effect(() => {
    const player = video;
    if (!player) return;

    const step = (by: number) => {
      player.currentTime = Math.min(visible, Math.max(0, player.currentTime + by));
      followPlayhead();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable) return;
      if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName)) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (player.paused) void player.play().catch(() => {});
        else player.pause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(e.shiftKey ? -1 : -0.1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(e.shiftKey ? 1 : 0.1);
      } else if (e.key === 'Home' || e.key === 'Backspace') {
        // Backspace means back. It used to remove the selected block, which is
        // a lot to ask of a key people hit to undo a character.
        e.preventDefault();
        player.currentTime = 0;
        followPlayhead();
      } else if (e.key === 'End') {
        e.preventDefault();
        player.currentTime = visible;
        followPlayhead();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Delete takes the selected block off the strip.
   *
   * Its own listener rather than a branch in the one above, because that one
   * only exists while there's a render to drive and this has nothing to do with
   * playback: a clip with nothing rendered yet still has blocks worth removing.
   * And when a clip is selected the pane is showing its source, so there is no
   * render player at all and that effect isn't running.
   *
   * No confirmation. It is undone from the toast it raises — which is how
   * everything else here is taken back, is quicker than a dialog for the case
   * where you meant it, and doesn't teach anyone to dismiss dialogs unread.
   */
  $effect(() => {
    const chosen = selection;
    const caption = pickedCaption;
    if (!chosen && caption === null) return;

    const onDelete = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Delete only. Backspace took a block off the strip as well, which is an
      // irreversible-looking action on the key people press to go back — and it
      // rewinds the playhead now, which is the thing that key should do.
      if (e.key !== 'Delete') return;

      // Only somewhere you can type: Delete is the field's own key there, and
      // taking it would remove a block instead of a character.
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable) return;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;

      e.preventDefault();
      if (chosen) onremove(chosen.kind, chosen.id);
      else if (caption !== null) {
        pickedCaption = null;
        oncaptionremove(caption);
      }
    };

    window.addEventListener('keydown', onDelete);
    return () => window.removeEventListener('keydown', onDelete);
  });

  // --- dragging ----------------------------------------------------------

  /**
   * The block this gesture would produce, moved or resized by `shift`.
   *
   * Moving clamps as a whole so a block pushed off either end keeps its length
   * instead of being squashed against the edge — the drag was "put this
   * somewhere else", not "make this shorter".
   */
  function applied(was: Span, grip: Grip, shift: number): Span {
    snapLine = null;

    /**
     * Takes the nearby value if there is one, and remembers it so the strip can
     * draw what was lined up with. Falls back to tenths, which is as fine as a
     * drag can honestly claim to be.
     */
    const settle = (value: number): number => {
      const target = nearest(value);
      if (target === null) return snap(value);
      snapLine = target;
      return target;
    };

    if (grip === 'move') {
      const span = was.end - was.start;
      /*
       * Both edges are offered, nearer one first. Lining a block up by its tail
       * is as common as by its head — a caption that should end on a cut — and
       * a block that only ever snapped by its start would refuse the more
       * useful half of the job.
       */
      const rawStart = Math.max(0, Math.min(was.start + shift, (drag?.ceiling ?? canvas) - span));
      const startTarget = nearest(rawStart);
      const endTarget = nearest(rawStart + span);

      let start: number;
      if (
        startTarget !== null &&
        (endTarget === null ||
          Math.abs(startTarget - rawStart) <= Math.abs(endTarget - (rawStart + span)))
      ) {
        snapLine = startTarget;
        start = startTarget;
      } else if (endTarget !== null) {
        snapLine = endTarget;
        start = endTarget - span;
      } else {
        start = snap(rawStart);
      }

      // The outer clamp matters for a block longer than the clip, which the
      // fields allow: without it the inner one hands back a negative start.
      // Moving changes nothing about how much audio there is, so `limit`
      // doesn't come into it.
      start = Math.max(0, Math.min(start, (drag?.ceiling ?? canvas) - span));
      return { ...was, start, end: start + span };
    }

    if (grip === 'start') {
      return {
        ...was,
        start: Math.min(Math.max(was.minStart, settle(was.start + shift)), was.end - MIN_SPAN)
      };
    }

    // Dragging the far edge is how an open-ended bed gets an end of its own.
    return {
      ...was,
      end: Math.max(Math.min(stretchTo(was), settle(was.end + shift)), was.start + MIN_SPAN),
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
  function updateDrag(clientX: number, clientY?: number) {
    if (!drag) return;

    // Keep the room ahead of where you are pointing, never behind it.
    const ahead = secondsAt(clientX) + 120 / pxPerSecond;
    if (ahead > drag.ceiling) drag = { ...drag, ceiling: ahead };

    const now = applied(drag.was, drag.grip, secondsAt(clientX) - drag.from);

    /*
     * Sideways is when, up and down is which lane — but only for a block being
     * moved whole. Dragging an edge is about length, and a block that changed
     * lane while being trimmed would be answering a question nobody asked.
     */
    const lane =
      drag.grip === 'move' && clientY !== undefined ? laneAt(clientY, drag.kind) : drag.lane;

    drag = { ...drag, now, lane };

    /*
     * The picture follows the edge being moved.
     *
     * Without this, placing something meant letting go and then scrubbing back
     * to find out what was there — you were choosing a number and hoping. The
     * edge you're holding is the one you're deciding about, so the frame under
     * it is the one worth showing: the far edge when stretching the end, the
     * near one otherwise.
     */
    if (video) video.currentTime = drag.grip === 'end' ? now.end : now.start;

    /*
     * The same decision, told in the file's own seconds.
     *
     * Timeline seconds and source seconds only agree for an untrimmed clip at
     * 1×, which is the one case nobody is dragging an edge in.
     */
    if (onscrubsource && drag.grip !== 'move') {
      if (drag.kind === 'clip') {
        const clip = clips.find((c) => c.id === drag!.key);
        if (clip) {
          onscrubsource(
            'clip',
            clip.id,
            drag.grip === 'end'
              ? clip.to + (now.end - clip.end) * clip.speed
              : clip.from + (now.start - clip.start) * clip.speed
          );
        }
      } else if (drag.kind === 'audio') {
        const track = tracks.find((t) => t.id === drag!.key);
        if (track) {
          const head = track.seek + (now.start - track.start);
          onscrubsource(
            'audio',
            track.id,
            drag.grip === 'end' ? head + (now.end - now.start) : head
          );
        }
      }
    }
  }

  /**
   * Slipping: moving the window through the file without moving the block.
   *
   * A separate gesture from the edge drags rather than a fourth grip, because
   * it works in a different set of units. The others ask where on the timeline
   * a moment is and get their answer from `secondsAt`; this one asks where in
   * the *file* a moment is, off a rail whose whole width is the file. Forcing
   * both through one path meant either converting twice or pretending the two
   * scales were the same.
   */
  let slip = $state<{
    kind: 'clip' | 'audio';
    key: number;
    from: number;
    to: number;
    /** Source seconds per pixel of rail, which is the file over the block. */
    perPx: number;
    startX: number;
    shift: number;
  } | null>(null);

  /** The window as it stands, including a slip in progress. */
  function slipped(kind: 'clip' | 'audio', key: number, from: number, to: number) {
    if (slip && slip.kind === kind && slip.key === key) {
      return { from: slip.from + slip.shift, to: slip.to + slip.shift };
    }
    return { from, to };
  }

  function startSlip(
    e: PointerEvent,
    kind: 'clip' | 'audio',
    key: number,
    from: number,
    to: number,
    total: number
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Whatever was focused before this press keeps nothing: a block being
    // dragged is not a form control, and leaving focus behind is how the
    // transport keys ended up talking to a button.
    (document.activeElement as HTMLElement | null)?.blur();

    const rail = e.currentTarget as HTMLElement;
    const width = rail.getBoundingClientRect().width;
    // Nothing to slip through, or nothing to slip it on.
    if (width <= 0 || total <= 0 || to - from >= total - 0.05) return;

    const release = beginDragGesture();
    slip = { kind, key, from, to, perPx: total / width, startX: e.clientX, shift: 0 };

    try {
      rail.setPointerCapture(e.pointerId);
    } catch {
      // Already gone; the listeners below still see the gesture through.
    }

    const move = (ev: PointerEvent) => {
      if (!slip) return;
      const wanted = (ev.clientX - slip.startX) * slip.perPx;
      // The window can't leave the file at either end.
      const shift = Math.max(-slip.from, Math.min(total - slip.to, wanted));
      slip = { ...slip, shift };
      // Park whatever is showing this file on the frame the window now opens on.
      onscrubsource?.(kind, key, slip.from + shift);
    };

    const finish = () => {
      release();
      rail.removeEventListener('pointermove', move);
      rail.removeEventListener('pointerup', finish);
      rail.removeEventListener('pointercancel', finish);

      const settled = slip;
      slip = null;
      if (!settled || settled.shift === 0) return;

      // Where the window now opens, so pressing play plays the new part of the
      // file rather than resuming inside the old one.
      onscrubsource?.(kind, key, settled.from + settled.shift);

      if (settled.kind === 'clip') onclip(settled.key, { slip: tidy(settled.shift) });
      else onaudio(settled.key, { seekBy: tidy(settled.shift) });
    };

    rail.addEventListener('pointermove', move);
    rail.addEventListener('pointerup', finish);
    rail.addEventListener('pointercancel', finish);
  }

  /**
   * The part of the file a block is using, read off the live span so it moves
   * under the edge being dragged rather than after it.
   */
  const clipWindow = (clip: TimelineClip, at: Span) => ({
    from: clip.from + (at.start - clip.start) * clip.speed,
    to: clip.to + (at.end - clip.end) * clip.speed
  });

  const trackWindow = (track: TimelineTrack, at: Span) => {
    // A bed plays at 1x, so its span on the timeline is its span in the song.
    const from = track.seek + (at.start - track.start);
    return { from, to: from + (at.end - at.start) };
  };

  /**
   * Whether the slip rail is worth drawing — and so whether to leave room for
   * one under the block's contents.
   *
   * Asked in both places from here rather than restated in each, because the
   * two answers drifting apart is exactly what a block with a gap under it and
   * nothing in the gap looks like.
   */
  const railed = (window: { from: number; to: number }, total: number) =>
    total > 0.05 && window.to - window.from < total - 0.05;

  /**
   * The selected caption, if any.
   *
   * Kept here rather than handed up with the others, because a caption has
   * nothing for the preview pane to show — selecting one means "this is what
   * Delete would take", and nothing else. The clip and bed selections travel up
   * because they change what is on screen; this one doesn't.
   */
  let pickedCaption = $state<number | null>(null);

  /** Last seen pointer position, so the edge pull works while it's held still. */
  let pointerX = 0;
  /**
   * Whether this gesture has actually moved yet.
   *
   * The pull used to start on the press. Grab the right edge of a block that is
   * already at the end — which is where its right edge is — and the strip began
   * scrolling before you had asked for anything, because pressing there put the
   * pointer inside the edge zone. A pull is an intent, and holding still is not
   * one.
   */
  let dragMoved = false;
  let pointerY = 0;
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
    if (!box || !drag || !dragMoved) return;

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

    updateDrag(pointerX, pointerY);
  }

  function startDrag(
    e: PointerEvent,
    kind: Kind,
    key: number,
    grip: Grip,
    was: Span,
    /**
     * The lane the block is already in. Required rather than defaulted: a
     * forgotten one used to read as zero, so grabbing a bed's edge sent it to
     * the top row for the length of the gesture and dropped it back on release
     * — a block visibly moving somewhere it was never going.
     */
    startLane: number
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const release = beginDragGesture();
    drag = {
      kind,
      key,
      grip,
      from: secondsAt(e.clientX),
      was,
      now: was,
      lane: startLane,
      ceiling: reach,
      // Only a whole block can carry the rest with it. Trimming an edge changes
      // this block's length, which is not something the others should share in.
      ripple: e.shiftKey && grip === 'move'
    };

    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Already gone; the listeners below still see the gesture through.
    }

    pointerX = e.clientX;
    dragMoved = false;
    const pressedAt = e.clientX;
    edgeFrame = requestAnimationFrame(edgePull);

    const move = (ev: PointerEvent) => {
      // A few pixels, so a press that wobbles isn't read as a drag.
      if (Math.abs(ev.clientX - pressedAt) > 3) dragMoved = true;
      pointerX = ev.clientX;
      pointerY = ev.clientY;
      updateDrag(ev.clientX, ev.clientY);
    };

    const finish = () => {
      release();
      cancelAnimationFrame(edgeFrame);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);

      const settled = drag;
      drag = null;
      /*
       * After `drag` is cleared, not before: an override lasts until a
       * dependency changes, and `drag` is one of them. Assigning first would
       * have the value thrown away in the same breath.
       */
      if (settled) visible = Math.max(visible, settled.now.end);
      snapLine = null;
      if (!settled) return;

      const { was: before, now } = settled;
      const moved = now.start !== before.start || now.end !== before.end;
      const changedLane = settled.grip === 'move' && settled.lane !== startLane;
      if (!moved && !changedLane) {
        /*
         * A press that went nowhere is a click, and a click on a block asks to
         * see it. Decided here rather than with a separate `onclick`, because
         * the body of a block is a drag handle: a click handler beside the drag
         * would fire at the end of every move as well.
         */
        if (settled.grip === 'move') {
          if (settled.kind === 'fx') {
            opened = opened?.kind === 'fx' && opened.key === settled.key ? null : settled;
          } else if (settled.kind === 'caption') {
            pickedCaption = pickedCaption === settled.key ? null : settled.key;
          } else {
            // Only one thing chosen at a time, and a Delete with two candidates
            // is a coin toss. Cleared here, where the choice is actually made,
            // rather than by an effect watching the selection afterwards.
            pickedCaption = null;
            onpreview(settled.kind, settled.key, false);
          }
        }
        return;
      }

      /*
       * A ripple is one message about the whole strip, so it is said here and
       * the per-block writes below are skipped: the block that was dragged is
       * itself one of the things starting at or after where it started.
       */
      if (settled.ripple) {
        const shift = tidy(now.start - before.start);
        if (shift !== 0) onripple(before.start, shift);
        return;
      }

      /*
       * Park the block's own player on where it now begins.
       *
       * Letting go of a block you have just retimed and pressing play should
       * play the shot, not resume from wherever it happened to be paused
       * before you moved it. The paused position belonged to the old edit; the
       * edit has changed underneath it.
       */
      if (onscrubsource) {
        const head = settled.grip === 'start' ? now.start - before.start : 0;
        if (settled.kind === 'clip') {
          const clip = clips.find((c) => c.id === settled.key);
          if (clip) onscrubsource('clip', clip.id, clip.from + head * clip.speed);
        } else if (settled.kind === 'audio') {
          const track = tracks.find((t) => t.id === settled.key);
          if (track) onscrubsource('audio', track.id, track.seek + head);
        }
      }

      if (settled.kind === 'clip') {
        if (settled.grip === 'move') {
          // Moved whole: where it begins and which row it's in. Nothing about
          // the footage changed, so the trim is left alone.
          onclip(settled.key, { start: tidy(now.start), lane: settled.lane });
        } else {
          // How much the block gained or lost at each edge. The editor turns
          // that into source seconds, because it knows the speed.
          onclip(settled.key, {
            head: tidy(now.start - before.start),
            tail: tidy(now.end - before.end)
          });
        }
      } else if (settled.kind === 'fx') {
        // The row is written now that there are two of them. It is where the
        // block is drawn and nothing else: overlapping effects all apply, so
        // the render never reads it.
        oneffects?.(
          effects.map((fx, i) =>
            i === settled.key
              ? { ...fx, start: tidy(now.start), end: tidy(now.end), lane: settled.lane }
              : fx
          )
        );
      } else if (settled.kind === 'caption') {
        oncaptions(
          captions.map((c, i) =>
            i === settled.key
              ? { ...c, start: tidy(now.start), end: tidy(now.end), lane: settled.lane }
              : c
          )
        );
      } else {
        /*
         * Moving a bed gives it an end of its own.
         *
         * "Until the clip does" is a length that depends on where it starts, so
         * dragging an open-ended bed leftwards used to make it longer every
         * time — the block grew under the hand that was only trying to move it.
         * A move should move. The right edge is still there to send it back to
         * the end, and it snaps when it gets there.
         */
        const keepsOpen = now.openEnded && settled.grip !== 'move';
        onaudio(settled.key, {
          start: tidy(now.start),
          end: keepsOpen ? null : tidy(now.end),
          lane: settled.lane,
          /*
           * The left edge cues the song, it doesn't slide it.
           *
           * It moved the bed's window and left `seek` alone, so pulling the head
           * in pushed the whole song later — the one beat you had lined up moved
           * off the frame you lined it up with. A clip's head has always worked
           * the other way, and two edges that look identical and do opposite
           * things is worse than either of them.
           */
          ...(settled.grip === 'start' ? { seekBy: tidy(now.start - before.start) } : {})
        });
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
  <!-- A shadow under the text, because a bed draws its waveform behind it: pale
       words on a pale peak on a mid-green block is three similar tones fighting,
       and the one that loses is the name. Costs nothing on a caption, which has
       nothing behind it. -->
  <span class="flex h-full min-w-0 flex-1 items-center gap-1.5 px-1">
    {#if roomy}
      <span class="min-w-0 flex-1 truncate text-left">{label}</span>
    {/if}
    <span class="min-w-0 flex-1 truncate text-right {roomy ? TIME : 'tabular-nums'}">
      {secs(at.start)}–{secs(at.end)}
    </span>
  </span>
{/snippet}

<!--
  Watch this one on its own.
  
  `stopPropagation` on the pointer rather than relying on the click: the blocks
  either side of this are dragged with pointerdown, and without it a press here
  would start a drag as well as a preview.
-->
<!--
  What of the file is in use, drawn along the foot of the block.

  The block itself can only be as wide as the part that plays, so there is
  nowhere on it to see that you are using thirty seconds out of three minutes —
  or which thirty. This bar is the whole file laid across the block's width,
  lit between the in and out points: the dark ends are what was cut, and their
  edges are where the cuts are.

  Only drawn when something was actually cut. An untrimmed block would show a
  bar lit end to end, which is a line of chrome saying nothing.
-->
{#snippet extent(
  kind: 'clip' | 'audio',
  key: number,
  from: number,
  to: number,
  total: number,
  lit: string
)}
  {#if railed({ from, to }, total)}
    {@const at = slipped(kind, key, from, to)}
    <!-- Tall enough to grab, because it does something.

         Dragging the lit part slides the window through the file while the
         block stays exactly where it is — the shot plays from somewhere else,
         at the same moment, for the same length. Trimming an edge and then
         putting the block back where it was is the same edit done in two
         moves, and the second move is the one you forget. -->
    <div
      role="slider"
      tabindex="-1"
      aria-label="Which part of the file plays"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={at.from}
      onpointerdown={(e) => startSlip(e, kind, key, from, to, total)}
      class="absolute inset-x-0 bottom-0 h-2 cursor-ew-resize bg-black/50"
    >
      <div
        class="absolute inset-y-0 rounded-sm {lit}"
        style="left: {Math.max(0, Math.min(1, at.from / total)) * 100}%; right: {Math.max(
          0,
          Math.min(1, 1 - at.to / total)
        ) * 100}%"
      ></div>
    </div>
  {/if}
{/snippet}

{#snippet playButton(kind: 'clip' | 'audio', id: number, label: string)}
  <!-- Pause when it's this one that's running. A button that only ever starts
       something means the way to stop it is to find the player it started, and
       the whole point of pressing it here was not having to look there. -->
  {@const running = selectionPlaying && selection?.kind === kind && selection.id === id}
  <button
    type="button"
    onpointerdown={pressTool}
    onclick={() => {
      pickedCaption = null;
      onpreview(kind, id, true);
    }}
    title={running ? `Pause ${label}` : `Play ${label} on its own`}
    aria-label={running ? `Pause ${label}` : `Play ${label} on its own`}
    class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/10 transition-colors hover:bg-white/25"
  >
    <Icon src={running ? Pause : Play} size={`${ICON}`} />
  </button>
{/snippet}

<!-- The strip, the captions over it, and the music under them: one stack, one
     time axis, so what lines up on screen lines up in the render.

     No frame around it and nothing written underneath. This fills its footer
     edge to edge, and every row of chrome was a row the clip wasn't using. -->
<!-- Scrolls, without saying so.

     The strip is dragged and the wheel zooms it, so the native bar was a row of
     chrome nobody used sitting across the bottom of the one thing that wanted
     the height. Hidden rather than removed: `overflow-x-auto` still scrolls by
     wheel, trackpad, keyboard and the edge-pull, so nothing that could reach
     the far end has lost its way of getting there. -->
<!-- The strip and the overview of it, one above the other. The overview sits
     outside the scroller deliberately: in it, that row was as wide as the strip
     — thousands of pixels — so its percentages measured the strip rather than
     the window, only a slice was ever on screen, and clicking near what looked
     like its right-hand end was really clicking somewhere in the middle of a
     very long bar. An overview has to be the width of the thing you are looking
     through, not the thing you are looking at. -->
<div class="min-w-0">
  <!-- The gutter sits beside the scroller rather than inside it, so it stays
       put while the strip pans under it — inside, it would scroll away with
       the first block. -->
  <div class="flex">
    <div
      class="relative shrink-0 select-none"
      style="width: {GUTTER}px; height: {stripHeight}px"
      aria-hidden="true"
    >
      {#each laneBands as band, index (band.label)}
        <div
          class="absolute right-0 left-0 flex items-center justify-center text-gray-600"
          style="top: {band.top}px; height: {band.height}px"
          title={band.label}
        >
          <Icon src={band.icon} size="14" />
        </div>
        <!-- A rule where the lanes divide, so the icons read as four groups
             rather than four marks at four heights. Drawn down the middle of
             the gap the rows already leave, which is the same line the strip
             makes to the right of it — the column and the lanes are separated
             by the same edge rather than by two that nearly agree. -->
        {#if index < laneBands.length - 1}
          <div
            class="absolute right-1 left-1 h-px bg-white/[0.08]"
            style="top: {Math.round(band.top + band.height + LANE_GAP / 2)}px"
          ></div>
        {/if}
      {/each}
    </div>

    <div
      bind:this={scroller}
      bind:clientWidth={windowWidth}
      onwheel={zoom}
      class="no-scrollbar min-w-0 flex-1 overflow-x-auto"
    >
      <!-- Eased, except while a gesture is under way.

         The strip's length changes whenever the clip does — a block dropped
         further out, a bed deleted — and jumping to the new width reads as a
         glitch. It must not ease during a drag though: `secondsAt` measures this
         element to turn a pointer into a time, and a width still on its way
         somewhere would put the block behind the hand for the length of the
         animation. -->
      <div
        bind:this={lane}
        role="presentation"
        onpointerdown={startPan}
        ondblclick={addCaptionHere}
        class="relative bg-gray-900 select-none {drag || panning
          ? ''
          : 'transition-[width] duration-200 ease-out'} {panning
          ? 'cursor-grabbing'
          : 'cursor-grab'}"
        style="width: {stripWidth}px; height: {stripHeight}px"
      >
        <!-- A second, every second, so a glance can tell four from fourteen without
         counting. Kept faint: it's a ruler, not content. -->
        {#each ticks as second (second)}
          <div
            class="pointer-events-none absolute w-px bg-white/5"
            style="left: {percent(second)}; top: {lanesTop}px; height: {lanesHeight}px"
          ></div>
        {/each}

        <!-- Which row is for what, said in colour rather than in a column of words
         beside the strip. The blocks already carry these colours, so an empty
         row reads as "a caption goes here" without costing sixty pixels of
         width to spell it out — and horizontal space is what a timeline is
         made of. -->
        <!-- Past the end of the clip, and marked as such.

           The strip can reach further than the clip does: an effect dragged
           beyond the last frame still has to be visible and grabbable, so
           `visible` counts it where `contentEnd` does not. But the video is
           only as long as the clip, so pressing out here moves the playhead to
           a moment the picture has no frame for — it stops dead at the end and
           looks like scrubbing has broken, when there is simply nothing there.
           Saying so is cheaper than explaining it. -->
        {#if visible > duration + 0.05}
          <div
            class="pointer-events-none absolute inset-y-0 bg-gray-950/60"
            style="left: {percent(duration)}; right: 0"
          ></div>
        {/if}

        {#each Array(laneCount) as _, row (row)}
          <div
            class="pointer-events-none absolute inset-x-0 rounded-sm {row < CLIPS_AT
              ? 'bg-black/25'
              : row < CAPTIONS_AT
                ? 'bg-white/[0.03]'
                : row < AUDIO_AT
                  ? 'bg-violet-500/[0.07]'
                  : 'bg-emerald-500/[0.07]'}"
            style="top: {laneTop(row)}px; height: {laneHeight(row)}px"
          ></div>
        {/each}

        <!-- Effects, in the short row above the footage.

           Two handles and a name, and nothing else: at twenty-two pixels there
           is room for one of those and it should be the name. Everything else
           about an effect — which one, how hard, what colour — is in the
           dialog, which is what a click opens, because a block this size can
           hold a gesture or a control and not both. -->
        <!-- The look the whole clip is in, drawn as the lane's floor.

       Not a block: it has no start and no end to take hold of, and a bar
       spanning the strip that cannot be moved reads as something broken. As a
       floor it says the same thing — this is what the picture is in — and
       leaves the row free for the things that do have a position. Which is why
       one lane is enough: a clip-wide look and a tear on the chorus are not two
       things competing for the same space, they are a floor and what stands on
       it. -->
        {#if wideEffect}
          {@const wide = pictureEffectById(wideEffect.id)}
          {#if wide}
            <!-- Behind both rows: it is under everything in the lane rather
                 than beside it. -->
            <div
              class="pointer-events-none absolute inset-x-0 flex items-center rounded-sm border border-white/10 bg-black/40 px-1.5 text-[10px] tracking-wide text-gray-400 uppercase"
              style="top: {laneTop(0)}px; height: {laneTop(FX_ROWS - 1) +
                LANE_HEIGHTS.fx -
                laneTop(0)}px"
            >
              <span class="truncate">{wide.label}</span>
            </div>
          {/if}
        {/if}

        {#each effects as fx, index (index)}
          {@const at = shown('fx', index, fxSpan(fx))}
          {@const effect = pictureEffectById(fx.id)}
          <!-- A burst has no edges to pull.

             It lasts a sixth of a second, which is a pixel or two at any usable
             zoom, so resize handles would be two grab targets on a sliver with
             nothing between them — and its length is not the interesting thing
             about it anyway. Everything else is an ordinary block: the name
             inside, a wider floor so the name is readable, and the body both
             moves it and opens it. -->
          {@const burst = effect?.shape === 'burst'}
          <div
            data-block
            class="lane-label absolute flex items-center overflow-hidden rounded border border-white/20 bg-black/75 text-[11px] {drag?.kind ===
              'fx' && drag.key === index
              ? 'ring-2 ring-white/50'
              : opened?.kind === 'fx' && opened.key === index
                ? 'ring-2 ring-white/35'
                : ''}"
            style="left: {percent(at.start)}; width: {percent(at.end - at.start)}; min-width: {burst
              ? MIN_BURST_PX
              : MIN_BLOCK_PX}px; top: {laneTop(
              drag?.kind === 'fx' && drag.key === index ? drag.lane : (fx.lane ?? 0)
            )}px; height: {LANE_HEIGHTS.fx}px"
            title="{effect?.label ?? fx.id} · {burst
              ? secs(at.start)
              : `${secs(at.start)}–${secs(at.end)}`}"
          >
            {#if !burst}
              <button
                type="button"
                aria-label="{effect?.label ?? fx.id} start"
                onpointerdown={(e) => startDrag(e, 'fx', index, 'start', fxSpan(fx), fx.lane ?? 0)}
                class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-white/25 hover:bg-white/50"
              ></button>
            {/if}
            <!-- The body moves it and opens it, the way a clip's does. There is no
               field in here to press into by mistake, so it needs no separate
               grip the way a caption does. -->
            <button
              type="button"
              aria-label="Move {effect?.label ?? fx.id}"
              onpointerdown={(e) => startDrag(e, 'fx', index, 'move', fxSpan(fx), fx.lane ?? 0)}
              class="flex h-full min-w-0 flex-1 cursor-grab items-center gap-1 px-1.5 text-left text-white active:cursor-grabbing"
            >
              <span class="truncate">{effect?.label ?? fx.id}</span>
            </button>
            {#if !burst}
              <button
                type="button"
                aria-label="{effect?.label ?? fx.id} end"
                onpointerdown={(e) => startDrag(e, 'fx', index, 'end', fxSpan(fx), fx.lane ?? 0)}
                class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-white/25 hover:bg-white/50"
              ></button>
            {/if}
          </div>
        {/each}

        {#each clips as clip (clip.id)}
          {@const at = shown('clip', clip.id, clipSpan(clip))}
          {@const win = clipWindow(clip, at)}
          <!-- Only leave room under the contents when there is a rail to leave it
           for. An untrimmed block has nothing to slip and draws none, and the
           gap where one would have been read as a block sitting too high.

           Held by the block rather than by the thumbnail, which is how the bed
           lane has always done it. The thumbnail used to carry the whole margin
           on its own, so it cleared the rail and the label and the buttons
           beside it did not — they went on centring themselves against the full
           height and sat low against everything else on the block. -->
          {@const rail = railed(win, clip.length) ? 8 : 0}
          {@const running =
            selectionPlaying && selection?.kind === 'clip' && selection.id === clip.id}
          <!-- What is playing, which is the one thing the old contact sheet
           couldn't say — and matters most where a filmstrip is least use: the
           same shot three times over, three identical stretches of picture.

           The edges trim it. There is no footage between two clips, so pulling
           one in doesn't leave a gap: everything after it moves up, which is
           what a sequence means and what the render does. -->
          <div
            data-block
            class="lane-label absolute flex items-center overflow-hidden rounded border border-gray-500/70 bg-gray-700/70 text-[12px] {drag?.kind ===
              'clip' && drag.key === clip.id
              ? 'ring-2 ring-gray-300'
              : selection?.kind === 'clip' && selection.id === clip.id
                ? 'ring-2 ring-violet-400'
                : ''}"
            style="left: {percent(at.start)}; width: {percent(
              at.end - at.start
            )}; min-width: {MIN_BLOCK_PX}px; top: {laneTop(
              CLIPS_AT + (drag?.kind === 'clip' && drag.key === clip.id ? drag.lane : clip.lane)
            )}px; height: {LANE_HEIGHTS.clip}px; padding-bottom: {rail}px"
            title="{clip.label} · {secs(at.start)}–{secs(at.end)}{clip.from
              ? ` · plays from ${secs(clip.from)}s`
              : ''}"
          >
            <button
              type="button"
              aria-label="Trim the start of {clip.label}"
              onpointerdown={(e) =>
                startDrag(e, 'clip', clip.id, 'start', clipSpan(clip), clip.lane)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-gray-400/70 hover:bg-gray-200"
            ></button>

            <!-- The picture is the play button.

             They were two controls sitting side by side, each asking for width
             the block did not have, and both about the same thing: this shot.
             One is smaller, reads faster, and gives the thumbnail the height it
             wanted — a frame the size of a line of text says which colour the
             shot is and nothing else. -->
            <div class="relative my-1 ml-1 w-11 shrink-0 self-stretch">
              {#if clip.poster}
                <img src={clip.poster} alt="" class="h-full w-full rounded object-cover" />
              {:else}
                <div class="h-full w-full rounded bg-white/10"></div>
              {/if}
              <button
                type="button"
                onpointerdown={pressTool}
                onclick={() => onpreview('clip', clip.id, true)}
                title={running ? `Pause ${clip.label}` : `Play ${clip.label} on its own`}
                aria-label={running ? `Pause ${clip.label}` : `Play ${clip.label} on its own`}
                class="absolute inset-0 flex items-center justify-center rounded bg-black/25 transition-colors hover:bg-black/50"
              >
                <!-- A disc behind the glyph rather than a scrim over the whole
                 frame: the picture is the reason the thumbnail got bigger, and
                 dimming all of it to label a corner of it undoes that. -->
                <span
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <Icon src={running ? Pause : Play} size="12" />
                </span>
              </button>
            </div>

            <button
              type="button"
              aria-label="Move {clip.label}"
              onpointerdown={(e) =>
                startDrag(e, 'clip', clip.id, 'move', clipSpan(clip), clip.lane)}
              class="flex h-full min-w-0 flex-1 cursor-grab items-center gap-1.5 px-1 text-left active:cursor-grabbing"
            >
              <span class="min-w-0 flex-1 truncate">{clip.label}</span>
              {#if roomForBoth(at)}
                <!-- Where the cuts fall in the file, next to how long what's left
                 runs for. Dimmer than the length because it answers a rarer
                 question — which part of the footage this is — and only shown
                 when something was cut, since 0 to the end is the file. -->
                {#if clip.to - clip.from < clip.length - 0.05}
                  <span class={RANGE}>
                    {secs(clip.from)}–{secs(clip.to)}
                  </span>
                {/if}
                <span class={TIME}>{secs(at.end - at.start)}s</span>
              {/if}
            </button>
            <!-- The tools, out only when asked for.

               They used to sit on every block at every width, which is five
               things to look past on a strip you are reading, and a row of
               them on a short block that hung off its own end. -->
            {#if toolsOut('clip', clip.id, at)}
              <div class="flex items-center" transition:slide={SLIDE}>
                <!-- Said outright, the way a caption says its own.

               A single menu was fewer pixels and one more press for everything
               behind it, while a caption right underneath showed its whole set
               as icons. Two rows of blocks answering the same question two
               different ways is worse than either answer. -->
                <!-- Fades on the shot, beside its mute, because a bed has had
                     exactly these two all along and a shot is the same kind of
                     thing: a piece of material with two ends.

                     They fade opacity rather than brightness, so what they look
                     like depends on what is underneath. Over nothing they are a
                     fade from and to black; over another shot they dissolve —
                     which makes a crossfade two blocks overlapping, rather than
                     a third thing to go and find. -->
                {#if onfade}
                  <button
                    type="button"
                    onpointerdown={pressTool}
                    onclick={() => onfade(clip.id, { fadeIn: !clip.fadeIn })}
                    title={clip.fadeIn ? 'Fades up at the start' : 'Starts on a cut'}
                    aria-label="Fade {clip.label} in"
                    aria-pressed={clip.fadeIn}
                    class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {clip.fadeIn
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                  >
                    <!-- A wedge opening to the right: nothing, then picture. -->
                    <svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 19 L20 5 L20 19 Z" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onpointerdown={pressTool}
                    onclick={() => onfade(clip.id, { fadeOut: !clip.fadeOut })}
                    title={clip.fadeOut ? 'Fades away at the end' : 'Ends on a cut'}
                    aria-label="Fade {clip.label} out"
                    aria-pressed={clip.fadeOut}
                    class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {clip.fadeOut
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                  >
                    <!-- And the same wedge the other way round. -->
                    <svg width={ICON} height={ICON} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 19 L4 5 L4 19 Z" fill="currentColor" />
                    </svg>
                  </button>
                {/if}
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => onmute(clip.id, !clip.muted)}
                  title={clip.muted ? 'Its own sound is off' : 'Its own sound is on'}
                  aria-label="{clip.muted ? 'Unmute' : 'Mute'} {clip.label}"
                  aria-pressed={clip.muted}
                  class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {clip.muted
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                >
                  <Icon src={clip.muted ? SpeakerXMark : SpeakerWave} size={`${ICON}`} />
                </button>
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => onremove('clip', clip.id)}
                  title="Take it off the timeline"
                  aria-label="Remove {clip.label}"
                  class="mr-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/35 text-white transition-colors hover:bg-red-500/60"
                >
                  <Icon src={XMark} size={`${ICON}`} />
                </button>
              </div>
            {/if}
            {@render toolsButton('clip', clip.id, clipSpan(clip), clip.label)}
            <!-- Outside the drawer, like every other block's.

               It was in there with the mute and the remove, which is where a
               button belongs and an edge does not: a handle is part of the
               shape of the block, not one of the things you can do to it. The
               left edge was never in the drawer, so a clip had one edge you
               could always take hold of and one you had to go and find — and
               nothing about the block said which. Captions and beds both keep
               theirs out here; this was the odd one. -->
            <button
              type="button"
              aria-label="Trim the end of {clip.label}"
              onpointerdown={(e) => startDrag(e, 'clip', clip.id, 'end', clipSpan(clip), clip.lane)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-gray-400/70 hover:bg-gray-200"
            ></button>
            {@render extent('clip', clip.id, win.from, win.to, clip.length, 'bg-gray-200/80')}
          </div>
        {/each}

        {#each captions as caption, index (index)}
          {@const at = shown('caption', index, captionSpan(caption))}
          {@const anchor = anchors[anchorOf(caption)]}
          <div
            data-block
            class="lane-label absolute flex items-center overflow-hidden rounded border border-violet-400/70 bg-violet-600/80 text-[12px] shadow {drag?.kind ===
              'caption' && drag.key === index
              ? 'ring-2 ring-violet-300'
              : pickedCaption === index
                ? 'ring-2 ring-violet-200'
                : ''}"
            style="left: {percent(at.start)}; width: {percent(
              at.end - at.start
            )}; min-width: {MIN_CAPTION_PX}px; top: {laneTop(
              CAPTIONS_AT +
                (drag?.kind === 'caption' && drag.key === index ? drag.lane : (caption.lane ?? 0))
            )}px; height: {LANE_HEIGHTS.caption}px"
          >
            <!-- Edges resize, the middle moves. Each is its own target rather than
             one handler reading where in the block the pointer landed, so a
             narrow block's edges stay grabbable instead of covering it. -->
            <button
              type="button"
              aria-label="Caption {index + 1} start"
              onpointerdown={(e) =>
                startDrag(e, 'caption', index, 'start', captionSpan(caption), caption.lane ?? 0)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-violet-300/70 hover:bg-violet-200"
            ></button>
            <!-- Wide enough to write in, so write in it.

               A caption's words are the caption. Reading them here and typing
               them in a list somewhere else meant looking in two places to do
               one thing, and the block already knows which caption it is.

               Below that width there is no room for a cursor, let alone a
               sentence, so it falls back to saying when it is — which is the
               part a narrow block can still be useful about. -->
            {#if roomToType(at)}
              <!-- A handle of its own, because the body is now a text field and a
                 field can't also be something you drag: pressing into words to
                 move a block would select them instead. -->
              <button
                type="button"
                aria-label="Move caption {index + 1}"
                onpointerdown={(e) =>
                  startDrag(e, 'caption', index, 'move', captionSpan(caption), caption.lane ?? 0)}
                class="ml-1 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded bg-black/20 transition-colors hover:bg-black/40 active:cursor-grabbing"
              >
                <!-- Six dots, drawn here because no icon set has a grip and the
                   nearest thing in this one — two stacked lines — reads as an
                   equals sign. Filled dots on the same 24 box as everything
                   else, at a size that leaves the handle some air: it is the
                   quietest thing on the block and should look it. -->
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="text-white/60"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                </svg>
              </button>
              <input
                value={typed(caption.text)}
                placeholder="Say something"
                aria-label="Caption {index + 1} text"
                title="{typed(caption.text) || 'Say something'} · {secs(at.start)}–{secs(at.end)}"
                data-caption={index}
                onpointerdown={(e) => e.stopPropagation()}
                onfocus={() => (pickedCaption = index)}
                onkeydown={(e) => {
                  const field = e.currentTarget as HTMLInputElement;
                  // Enter is "done"; with shift it's a second line.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) insertAtCursor(field, BREAK);
                    else field.blur();
                  }
                  e.stopPropagation();
                }}
                onchange={(e) =>
                  oncaptions(
                    captions.map((c, i) =>
                      i === index
                        ? { ...c, text: written((e.currentTarget as HTMLInputElement).value) }
                        : c
                    )
                  )}
                class="h-full min-w-0 flex-1 bg-transparent px-1 text-[12px] text-white placeholder:text-white/40 focus:outline-none"
              />
              {#if (at.end - at.start) * pxPerSecond >= 260}
                <span class="{TIME} px-1">
                  {secs(at.start)}–{secs(at.end)}
                </span>
              {/if}
            {:else}
              <button
                type="button"
                aria-label="Move caption {index + 1}"
                title="{typed(caption.text) || 'Empty caption'} · {secs(at.start)}–{secs(at.end)}"
                onpointerdown={(e) =>
                  startDrag(e, 'caption', index, 'move', captionSpan(caption), caption.lane ?? 0)}
                class="flex h-full min-w-0 flex-1 cursor-grab items-center active:cursor-grabbing"
              >
                {@render blockText(typed(caption.text) || '—', at)}
              </button>
            {/if}
            <!-- Where it sits in the picture, on the block rather than in a lane
               of its own: three rows would have said the same thing and cost a
               third of the strip's height to say it. The icon is the frame with
               the line drawn where the caption will be, so it reports as well
               as sets. -->
            {#if toolsOut('caption', index, at)}
              <div class="flex items-center" transition:slide={SLIDE}>
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => cycleAnchor(index)}
                  title="Caption sits at the {anchor.label.toLowerCase()} — click to move it"
                  aria-label="Caption {index + 1} sits at the {anchor.label.toLowerCase()}"
                  class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/40 text-white transition-colors hover:bg-black/60"
                >
                  <!-- Drawn here rather than taken from the set, because none of
                   them is this: a frame with the caption's line in it, where the
                   caption's line will be. Lucide's align icons say "aligned to
                   the top" in the abstract; this says where the words go, which
                   is the question being asked. On the library's grid all the
                   same — 24, stroke 2, round ends — so it sits in the row
                   without announcing itself. -->
                  <svg
                    width={ICON}
                    height={ICON}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width={STROKE}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2.5" />
                    <line
                      x1="7"
                      x2="17"
                      y1={anchor.id === 'top' ? 7.5 : anchor.id === 'middle' ? 12 : 16.5}
                      y2={anchor.id === 'top' ? 7.5 : anchor.id === 'middle' ? 12 : 16.5}
                    />
                  </svg>
                </button>
                <!-- What colour it's in.

             The swatch shows the colour the caption is actually drawn in, its
             own or the clip's, so a row of blocks reads as the row of captions
             does. Auto in the picker gives the clip its say back — without it,
             touching the colour once would cut that caption off from the brand
             for good.

             `stopPropagation` on the way in because the picker sits inside a
             block you can drag: without it, reaching for the wheel would pick
             the caption up and slide it. -->

                <!-- And the panel behind it, which is a colour with the same three
               ways out: this one, the clip's, or none at all.

               A second wheel rather than a switch because the two are read
               together — a caption is legible or not by what its text and its
               panel do to each other, and picking one while the other is a
               toggle somewhere else is how you end up with yellow on yellow. -->

                <!-- Small or big, next to where it sits: the two things about a caption
             that are decided by looking at the picture rather than by reading
             the words. Lit when it's the big one. -->
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() =>
                    oncaptions(
                      captions.map((c, i) => (i === index ? { ...c, headline: !c.headline } : c))
                    )}
                  title={caption.headline
                    ? 'Big — click for normal size'
                    : 'Normal — click for big'}
                  aria-label="Caption {index + 1} size"
                  aria-pressed={Boolean(caption.headline)}
                  class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {caption.headline
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                >
                  <!-- No icon set draws "Aa" — heroicons included — and a letter
                   saying its own size is clearer than anything that would stand
                   in for it. Sized off ICON so it grows with the row. -->
                  <span
                    class="leading-none font-semibold tracking-tight"
                    style="font-size: {ICON}px"
                  >
                    <span class="text-[0.6em]">a</span><span>A</span>
                  </span>
                </button>
                <!-- Removing it, said outright.

             Delete on the keyboard only reaches a caption that isn't being
             typed in, and clicking one puts the cursor in it — so the obvious
             gesture and the obvious key pointed at each other. A button on the
             block has neither problem, and is the same answer the rows in Media
             give. -->
                <!-- The way to the effect picker, which is too big to live in
                     a drawer.

                     The drawer and the dialog were two routes to the same
                     settings, so the tools button could send you down whichever
                     one fitted and nobody had to know which they were getting.
                     Effects broke that: they only exist in the dialog, and the
                     dialog only opens when a block is too narrow for the
                     drawer — so a caption wide enough to work with comfortably
                     was the one caption whose effect you could not reach. -->
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => (opened = { kind: 'caption', key: index })}
                  title="Entrance and damage"
                  aria-label="Caption {index + 1} effect"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/35 text-white transition-colors hover:bg-black/60"
                >
                  <Icon src={Sparkles} size={`${ICON}`} />
                </button>
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => {
                    pickedCaption = null;
                    oncaptionremove(index);
                  }}
                  title="Remove this caption"
                  aria-label="Remove caption {index + 1}"
                  class="mr-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/35 text-white transition-colors hover:bg-red-500/60"
                >
                  <Icon src={XMark} size={`${ICON}`} />
                </button>
              </div>
            {/if}
            {@render toolsButton('caption', index, captionSpan(caption), `caption ${index + 1}`)}
            <button
              type="button"
              aria-label="Caption {index + 1} end"
              onpointerdown={(e) =>
                startDrag(e, 'caption', index, 'end', captionSpan(caption), caption.lane ?? 0)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-violet-300/70 hover:bg-violet-200"
            ></button>
          </div>
        {/each}

        {#each tracks as track, index (track.id)}
          {@const at = shown('audio', track.id, trackSpan(track))}
          {@const win = trackWindow(track, at)}
          <!-- How much of the block the rail is taking, so everything else sits in
             what's left rather than in the whole thing and reads as low. -->
          {@const rail = railed(win, track.length) ? 8 : 0}
          <!-- Drawn and dragged exactly like a caption, because on this surface it
           now is one in every way that matters: it starts, it runs, it stops.
           The only tell is the colour and the lane it sits in. -->
          <div
            data-block
            class="lane-label absolute isolate flex items-center overflow-hidden rounded border border-emerald-400/60 bg-emerald-700/75 text-[12px] {drag?.kind ===
              'audio' && drag.key === track.id
              ? 'ring-2 ring-emerald-300'
              : selection?.kind === 'audio' && selection.id === track.id
                ? 'ring-2 ring-emerald-200'
                : ''}"
            style="left: {percent(at.start)}; width: {percent(
              at.end - at.start
            )}; min-width: {MIN_BLOCK_PX}px; top: {laneTop(
              AUDIO_AT +
                (drag?.kind === 'audio' && drag.key === track.id ? drag.lane : (track.lane ?? 0))
            )}px; height: {LANE_HEIGHTS.audio}px; padding-bottom: {rail}px"
          >
            <!-- The song, behind the block's own furniture.

             One picture of the whole file, sized so its full length spans what
             the block's width would be if the block held the whole file, then
             slid left by the cued-in part. Which means the shape under the
             block is the shape of the audio actually playing there — drag the
             bed and the peaks move with it, drag its edge and they hold still
             while the window slides over them.

             `-z-10` inside the block's own stacking context: above its
             background, below everything you can press. -->
            {#if track.waveform && track.length > 0}
              {@const span = Math.max(at.end - at.start, 0.05)}
              {@const head = track.seek + (at.start - track.start)}
              <!-- Height stated outright. With `top` and `bottom` both set and a
                 width as well, an image is over-constrained: the browser keeps
                 its own proportions, ignores `bottom` and hangs it from the top,
                 which is why the waveform sat high in the block rather than
                 filling it. -->
              <img
                src={track.waveform}
                alt=""
                class="pointer-events-none absolute -z-10 max-w-none object-fill opacity-25"
                style="width: {(track.length / span) * 100}%; left: {(-head / span) *
                  100}%; top: 4px; height: calc(100% - {rail + 8}px)"
              />
            {/if}
            <button
              type="button"
              aria-label="{track.label} start"
              onpointerdown={(e) =>
                startDrag(e, 'audio', track.id, 'start', trackSpan(track), track.lane ?? 0)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-l bg-emerald-300/80 hover:bg-emerald-200"
            ></button>
            {@render playButton('audio', track.id, track.label)}
            <button
              type="button"
              aria-label="Move {track.label}"
              title="{track.label} · {secs(at.start)}–{secs(at.end)}{track.seek
                ? ` · plays from ${secs(track.seek)}s`
                : ''}"
              onpointerdown={(e) =>
                startDrag(e, 'audio', track.id, 'move', trackSpan(track), track.lane ?? 0)}
              class="flex h-full min-w-0 flex-1 cursor-grab items-center active:cursor-grabbing"
            >
              {@render blockText(track.label, at)}
            </button>
            {#if toolsOut('audio', track.id, at)}
              <div class="flex items-center" transition:slide={SLIDE}>
                <!-- Fades, ducking and removal, said the way a caption and a clip say
               theirs. A bed has more to say than either, which is exactly why it
               had a menu — but a menu is a place things go to be forgotten, and
               these three are the whole of what a bed does. -->
                {#each [{ key: 'fadeIn' as const, on: track.fadeIn, label: 'Fade in', d: 'M4 18h16V8z' }, { key: 'fadeOut' as const, on: track.fadeOut, label: 'Fade out', d: 'M4 18h16L4 8z' }] as f, i (f.key)}
                  <button
                    type="button"
                    onpointerdown={pressTool}
                    onclick={() => onaudio(track.id, { [f.key]: !f.on })}
                    title="{f.label} — {f.on ? 'on' : 'off'}"
                    aria-label="{f.label} for {track.label}"
                    aria-pressed={f.on}
                    class="{i === 0
                      ? 'ml-2'
                      : 'ml-1'} flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {f.on
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                  >
                    <!-- Kept hand-drawn, like the placement icon: a ramp is what a
                   fade looks like, and no icon set draws one. Filled rather
                   than stroked, but on the same box as the rest so the row
                   stays a row. -->
                    <svg
                      width={ICON}
                      height={ICON}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={f.d} />
                    </svg>
                  </button>
                {/each}
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => onaudio(track.id, { duck: !track.duck })}
                  title="Duck under speech — {track.duck ? 'on' : 'off'}"
                  aria-label="Duck {track.label} under speech"
                  aria-pressed={track.duck}
                  class="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {track.duck
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-black/40 text-white/55 hover:bg-black/60 hover:text-white'}"
                >
                  <!-- A level that dips and comes back, which is what ducking is. -->
                  <Icon src={MusicalNote} size={`${ICON}`} />
                </button>
                <button
                  type="button"
                  onpointerdown={pressTool}
                  onclick={() => onremove('audio', track.id)}
                  title="Take it off the timeline"
                  aria-label="Remove {track.label}"
                  class="mr-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/35 text-white transition-colors hover:bg-red-500/60"
                >
                  <Icon src={XMark} size={`${ICON}`} />
                </button>
              </div>
            {/if}
            {@render toolsButton('audio', track.id, trackSpan(track), track.label)}
            <button
              type="button"
              aria-label="{track.label} end"
              onpointerdown={(e) =>
                startDrag(e, 'audio', track.id, 'end', trackSpan(track), track.lane ?? 0)}
              class="h-full w-2 shrink-0 cursor-ew-resize rounded-r bg-emerald-300/80 hover:bg-emerald-200"
            ></button>
            {@render extent('audio', track.id, win.from, win.to, track.length, 'bg-emerald-200/80')}
          </div>
        {/each}

        {#if snapLine !== null}
          <!-- What the drag caught, so a block that stops short of where you were
           pulling it is explained rather than mysterious. -->
          <div
            class="pointer-events-none absolute inset-y-0 w-px bg-amber-300/80"
            style="left: {percent(snapLine)}"
          ></div>
        {/if}

        {#if canvas > duration + 0.05}
          <!-- Past the last picture. A bed can run out here and a block can be
           dragged out here, and both are allowed — but nothing renders past the
           final frame, so the strip says where that is rather than letting
           something look placed when it will never be heard or seen.

           Always drawn now, because the strip always runs a little past the end
           to leave somewhere to drag into, and empty room that looks the same
           as the clip is room you'd think was part of it. -->
          <div
            class="pointer-events-none absolute inset-y-0 border-l border-dashed border-white/20 bg-black/40"
            style="left: {percent(duration)}; right: 0"
          ></div>
        {/if}

        <!-- Drawn last so it rides over everything it's measuring. -->
        <div
          class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_4px_rgba(0,0,0,0.9)]"
          style="left: {percent(Math.min(playhead, visible))}"
        ></div>
      </div>
    </div>
  </div>

  <!-- Indented to match, so the overview starts where the strip starts. -->
  <div style="padding-left: {GUTTER}px">
    <TimelineMinimap
      {canvas}
      live={Boolean(drag) || panning}
      {clips}
      {captions}
      {playhead}
      effects={effects.map((fx) => ({ start: fx.start ?? 0, end: fx.end ?? duration }))}
      {viewFrom}
      {viewWidth}
      tracks={tracks.map((t) => ({ start: t.start, end: t.end ?? duration }))}
      onscrub={scrubTo}
    />
  </div>
</div>

<!-- Outside the strip, so a modal isn't a child of something that pans. -->
{#if opened?.kind === 'fx' && effects[opened.key]}
  {@const index = opened.key}
  <FxDialog
    effect={effects[index]}
    {index}
    {clipId}
    {swatches}
    onchange={(patch) =>
      oneffects?.(effects.map((fx, i) => (i === index ? { ...fx, ...patch } : fx)))}
    onremove={() => {
      oneffects?.(effects.filter((_, i) => i !== index));
      opened = null;
    }}
    onclose={() => (opened = null)}
  />
{/if}

{#if opened?.kind === 'caption' && captions[opened.key]}
  {@const caption = captions[opened.key]}
  {@const index = opened.key}
  <CaptionDialog
    {caption}
    {index}
    {anchors}
    anchor={anchors[anchorOf(caption)].id}
    {swatches}
    {inheritedColor}
    {inheritedBackdrop}
    {inheritedEffect}
    {onkeepcolor}
    onchange={(patch) => oncaptions(captions.map((c, i) => (i === index ? { ...c, ...patch } : c)))}
    onremove={() => oncaptionremove(index)}
    onclose={() => (opened = null)}
  />
{/if}

<!-- A shot or a bed, same shell, when their blocks were too small as well. -->
{#if opened?.kind === 'clip'}
  {@const clip = clips.find((c) => c.id === opened?.key)}
  {#if clip}
    <TrackDialog
      kind="clip"
      label={clip.label}
      muted={clip.muted}
      onmute={(muted) => onmute(clip.id, muted)}
      onremove={() => onremove('clip', clip.id)}
      onclose={() => (opened = null)}
    />
  {/if}
{/if}

{#if opened?.kind === 'audio'}
  {@const track = tracks.find((t) => t.id === opened?.key)}
  {#if track}
    <TrackDialog
      kind="audio"
      label={track.label}
      fadeIn={track.fadeIn}
      fadeOut={track.fadeOut}
      duck={track.duck}
      onaudio={(patch) => onaudio(track.id, patch)}
      onremove={() => onremove('audio', track.id)}
      onclose={() => (opened = null)}
    />
  {/if}
{/if}

<!-- Two buttons that say what they open, in the same white as the rest of the
     row.

     They were drawn in the colours they set for a while, and before that the
     block itself was. Both are true and neither is legible: a control's job in
     a row of five is to be found, and a dark caption colour on a dark button is
     a control you have to hunt for. The colour is shown where you go to change
     it, which is the moment you are asking about it. -->
<!-- The one button every block ends with.
     Where there is room it slides the tools out beside the label; where there
     isn't, the same press opens the dialog. Lit while its tools are showing,
     because a row of blocks should say which one you are working on. -->
{#snippet toolsButton(kind: 'clip' | 'caption' | 'audio', key: number, span: Span, what: string)}
  <button
    type="button"
    onpointerdown={pressTool}
    onclick={() => toggleTools(kind, key, span)}
    title={roomForTools(kind, span) ? 'Settings' : 'Settings — opens in a window'}
    aria-label="Settings for {what}"
    aria-expanded={toolsOut(kind, key, span)}
    class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors {toolsOut(
      kind,
      key,
      span
    )
      ? 'bg-white text-gray-900 shadow-sm'
      : 'bg-black/40 text-white hover:bg-black/60'}"
  >
    <Icon src={roomForTools(kind, span) ? AdjustmentsHorizontal : Cog6Tooth} size={`${ICON}`} />
  </button>
{/snippet}

{#snippet textColour()}
  <svg
    width={ICON}
    height={ICON}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={STROKE}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 16.5 12 4.5l6.5 12" />
    <path d="M8.25 12h7.5" />
    <path d="M4 20.5h16" />
  </svg>
{/snippet}

{#snippet panelColour()}
  <Icon src={Swatch} size={`${ICON}`} />
{/snippet}
