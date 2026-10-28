<script lang="ts">
  import { monitor } from '$lib/clips/monitor.svelte';
  import RenderDial from '$lib/components/clips/editor/RenderDial.svelte';
  import SendPanel from '$lib/components/clips/editor/SendPanel.svelte';
  import AdvancedPanel from '$lib/components/clips/editor/AdvancedPanel.svelte';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { selection } from '$lib/clips/editor.svelte';
  import { untrack } from 'svelte';
  import { ClipPlayback } from '$lib/clips/playback.svelte';
  import { cutJoin, dissolveJoin, type Join } from '$lib/clips/joins';
  import { toLocalInput, fromLocalInput } from '$lib/utils/datetime';
  import { keepColor } from '$lib/brand-colors.remote';
  import MediaPicker from '$lib/components/ui/MediaPicker.svelte';
  import MediaAdd from '$lib/components/ui/MediaAdd.svelte';
  import FontSelect from '$lib/components/ui/FontSelect.svelte';
  import PostPreview from '$lib/components/clips/PostPreview.svelte';
  import {
    ColorWheel,
    PopoverPanel,
    RichTextEditor,
    TagInput,
    ToggleSwitch
  } from '$lib/components/ui';
  import { onMount } from 'svelte';
  import { Autosave } from '$lib/utils/autosave.svelte';
  import { autosaving } from '$lib/stores/autosaving.svelte';
  import { renderFingerprint } from '$lib/clips/fingerprint';
  import { ClipHistory } from '$lib/clips/history.svelte';
  import { clipLayout } from '$lib/clips/layout';
  import { secs, tidy } from '$lib/clips/time';
  import { clipWideEffect, pictureCss, shotEffects } from '$lib/clips/effects';
  import {
    ClipOverlay,
    ClipTimeline,
    ClipTransport,
    type ZoomTools,
    EffectPicker,
    TrackDialog,
    CaptionDialog,
    FxDialog,
    FootageLook,
    ClipBeds,
    ClipStage,
    type StageBed,
    type StageShot,
    type TimelineClip,
    type TimelineTrack
  } from '$lib/components/clips';
  import {
    Icon,
    MagnifyingGlassMinus,
    MagnifyingGlassPlus,
    ArrowsRightLeft,
    Map as MapIcon,
    SpeakerWave,
    SpeakerXMark,
    Trash,
    ArrowsUpDown,
    Bars3BottomLeft,
    Swatch,
    PencilSquare,
    Photo,
    Film,
    PaperAirplane,
    RectangleGroup,
    ViewfinderCircle,
    AdjustmentsHorizontal,
    Sparkles,
    MusicalNote,
    ChatBubbleBottomCenterText,
    XMark
  } from 'svelte-hero-icons';
  import type { IconSource } from 'svelte-hero-icons';
  import { EditorPreview } from '$lib/components/ui';
  import { PhoneUploadDialog, QueueClipDialog } from '$lib/components/dialogs';
  import { formatDuration, ACCEPT_VIDEO, ACCEPT_IMAGE, ACCEPT_AUDIO } from '$lib/utils/upload';
  import { fieldClass, groupTitleClass, labelClass, numberClass } from '$lib/utils/classes';
  import { shortName } from '$lib/utils/text';
  import { socialIcons } from '$lib/blocks/utils';
  import {
    DEFAULT_CLIP_CONFIG,
    CAPTION_SIZE_DIVISOR,
    DEFAULT_ADVANCED_CONFIG,
    captionAnchors,
    stageGraphicId,
    BRANDING_FIELDS,
    type BrandStage,
    captionBackdrop,
    captionColor,
    ADVANCED_GROUPS,
    CLIP_PRESETS,
    NO_BACKDROP,
    CLIP_STATUS_DOTS,
    PLATFORM_NAMES,
    type ClipRotation,
    type ClipRenderConfig,
    type AppliedEffect,
    type PlacedEffect,
    type ClipAdvancedConfig,
    type TimedCaption
  } from '$lib/clips/types';
  import type { PageData } from './$types';
  import {
    updateProject,
    takeClipSnapshot,
    putClipSnapshot,
    saveClipDefaultTags,
    saveClipDefaultDescription,
    deleteProject,
    addToPool,
    removeFromPool,
    restoreToPool,
    placeSource,
    updateSource,
    removeSource,
    placeAudio,
    updateAudio,
    removeAudio,
    restoreSource,
    restoreAudio,
    rotateFootage,
    startRender,
    stopRender,
    getRenderStatus,
    sendForReview,
    createPreviewLink,
    resetPreviewLink,
    addToQueue,
    removeFromQueue,
    setQueueGap,
    setScheduledDate,
    publishNow
  } from '../data.remote';

  let { data }: { data: PageData } = $props();

  /** The caption box, so an emoji lands where the cursor is. */

  /*
   * The rendered clip's player, so a timed caption can be marked against it
   * instead of guessed at.
   *
   * Caption times are read on the body timeline — the sources end to end, after
   * trims and speed — and that is exactly what this video shows from its first
   * frame, since the intro is composited over the opening rather than added
   * before it. The outro is appended at the end and shifts nothing.
   *
   * Undefined until a render exists. There is no timeline to point at before
   * one, which is the honest state rather than a missing feature.
   */
  /*
   * The preview fits the column, not just its width. Sized by width alone, a
   * vertical clip came out taller than the screen and the transport sat below
   * the fold — play was a scroll away. The frame hugs the picture so the
   * overlays still land exactly on it; 60vh matches the source preview above.
   */
  /*
   * The picture follows the box it is in.
   *
   * It used to hug its own contents, which meant the height cap had nothing to
   * resolve against — a percentage height against a shrink-to-fit parent is no
   * cap at all, so dragging the timeline taller pushed the video out of sight
   * rather than shrinking it. The frame takes the clip's own shape instead, so
   * it can be sized by height and still sit exactly where the overlays expect:
   * the frame is the picture, letterboxing and all, which is what the render
   * does too.
   */
  /**
   * The stacked actions down the Send column, as one shape.
   *
   * Four buttons doing four jobs, written four times: one was a rounded-xl,
   * one wasn't full width, two had different horizontal padding. Side by side
   * that reads as a hierarchy nobody intended. Colour is the only thing that
   * should differ between them, so colour is the only thing each one says.
   */
  const sendAction =
    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed';

  const previewFrameClass =
    'relative mx-auto my-auto h-full max-h-full max-w-full overflow-hidden rounded-lg bg-black';
  const previewMediaClass = 'block h-full w-full rounded-lg bg-black object-contain';

  /**
   * Every write on this page goes through here.
   *
   * There is no Save button in the studio — a change is committed as you make
   * it — so this is the only thing standing between a refused write and finding
   * out about it on the next reload.
   */
  const autosave = new Autosave();

  /*
   * The rail says whether this is saved, rather than a chip over the pane.
   * One corner answers "is my work safe" whichever editor you are in — and in
   * this one the answer used to float over the picture, which is the part of
   * the screen least able to spare it.
   */
  /*
   * The autosave and the undo go to the rail together.
   *
   * Getters rather than values, because the rail reads them whenever it draws
   * and the stack is a rune class — handing over `canUndo` once would hand
   * over whether it was true at registration.
   */
  onMount(() =>
    autosaving.register(autosave, {
      get canUndo() {
        return history.canUndo;
      },
      get canRedo() {
        return history.canRedo;
      },
      get undoLabel() {
        return history.undoLabel;
      },
      get redoLabel() {
        return history.redoLabel;
      },
      undo: () => travel('undo'),
      redo: () => travel('redo')
    })
  );

  /*
   * Undo, hung off the one place every write already goes through.
   *
   * A snapshot either side of each write, named by what that write said it was
   * saving — so the twenty-one call sites are untouched and nothing else in
   * this file knows the history is here.
   *
   * Read from the server rather than from what is on screen: the page draws
   * the clip merged with defaults and with the layout derived off it, and an
   * undo has to put back what was *stored*.
   */
  const history = new ClipHistory();

  $effect(() => {
    const id = selected.id;
    autosave.watch = async (what, write) => {
      /*
       * Editing takes you to the edit.
       *
       * The strip stays live while Full is up — it is the transport as well as
       * the editor — so it is perfectly possible to trim a shot while watching
       * a file made an hour ago, and see nothing happen. Rather than locking
       * the strip and leaving a dead control to wonder about, the first change
       * puts the picture back on the thing being changed. Rendering is not a
       * change and doesn't go through here, so pressing Re-render leaves you
       * watching the render.
       */
      watching = 'edit';

      // Nothing to put back if we never saw where it started — and nothing to
      // record while an undo is the thing doing the writing.
      const before = history.applying ? null : await takeClipSnapshot(id);
      await write();
      if (!before) return;
      const after = await takeClipSnapshot(id);
      if (after) history.push(what, before, after);
    };
    return () => {
      autosave.watch = null;
    };
  });

  /*
   * A snapshot belongs to one clip; opening another starts again.
   *
   * Compared against a remembered id rather than tracked. `selected` is a
   * derived *object*, rebuilt every time the loader hands down new data — and
   * every save ends in `invalidateAll`. So an effect that reads `selected.id`
   * re-runs after each write, and this one emptied the stack the instant
   * something was pushed onto it: the step was recorded, the save finished,
   * and the history was wiped before anyone could press undo.
   */
  let historyFor: number | null = null;
  $effect(() => {
    const id = selected.id;
    if (historyFor === id) return;
    historyFor = id;
    untrack(() => history.clear());
  });

  /**
   * Puts a snapshot back, without the putting back being recorded.
   *
   * `invalidateAll` afterwards because every other write does: the page reads
   * the clip from the loader, and a restore that didn't reload would leave the
   * screen showing the state it just replaced.
   */
  async function travel(to: 'undo' | 'redo') {
    const step = to === 'undo' ? history.undo() : history.redo();
    if (!step) return;

    history.applying = true;
    try {
      await putClipSnapshot(to === 'undo' ? step.before : step.after);
      await invalidateAll();
      // Nothing is said about it. An undo shows itself — the strip moves, the
      // picture changes — and the button already names what the next one would
      // take back. Pressing undo four times earned four notifications for four
      // things you had just watched happen.
    } finally {
      history.applying = false;
    }
  }

  /*
   * Leaving the page with something unsaved. Two different holes.
   *
   * A field that commits on blur has committed nothing while the cursor is
   * still in it, so leaving by any route that isn't a click elsewhere took the
   * last thing typed with it. Blurring here fires the very handler that click
   * would have, and the request is away before the navigation is.
   *
   * A failed save is worse: it exists only on this screen. That one is worth
   * stopping for.
   */
  beforeNavigate((nav) => {
    (document.activeElement as HTMLElement | null)?.blur();

    const failure = autosave.failure;
    if (failure && !confirm(`Couldn't save ${failure.what}. Leave anyway and lose that change?`)) {
      nav.cancel();
    }
  });

  /*
   * The same question for a closing tab, where the browser owns the wording and
   * all we can do is ask it to ask.
   *
   * No blur-flush here, deliberately. A blur fires a save whether or not the
   * field changed, so flushing would put a write in flight every single time
   * the tab closed with a cursor in a field — and then this would find the page
   * unsettled and prompt, every time, for nothing.
   */
  $effect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!autosave.settled) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  });

  /*
   * What the caption box says right now.
   *
   * The box itself reports on blur — every keystroke is not worth a round trip
   * — but the meter under it is there to be watched while writing, and reading
   * the saved value meant it sat still until you clicked away.
   */
  let captionText = $state('');

  /*
   * What the tag field holds right now, for the same reason.
   *
   * "Save as default" reads these rather than the loaded page data, because
   * pressing it is the *first* thing that blurs the field you were typing in:
   * the blur fires the save, the save is a round trip, and the click handler
   * runs long before it lands. Reading the server's copy therefore captured the
   * value from before the edit — which, the first time round, is nothing, and
   * "saved as default" quietly cleared the default instead.
   */
  let tagNames = $state<string[]>([]);

  let mediaPickerOpen = $state(false);
  /*
   * The open row, read from the selection rather than stored beside it.
   *
   * These were two pieces of state that had to be cleared in step — setting one
   * meant remembering to null the other — and a third copy lived in the strip.
   * Now there is one owner and these are two views of it.
   */
  const openSourceId = $derived(selection.current?.kind === 'clip' ? selection.current.id : null);
  const openTrackId = $derived(selection.current?.kind === 'audio' ? selection.current.id : null);
  let phoneUploadOpen = $state(false);

  const selected = $derived(data.project);

  // An id from one edit means nothing in the next, so opening another clip
  // starts with nothing selected.
  $effect(() => {
    selection.forProject(data.project.id);
  });

  /*
   * Reset from the project, so opening another clip — or a save landing —
   * shows that clip's caption rather than the last one typed.
   */
  $effect(() => {
    captionText = selected.description ?? '';
  });

  $effect(() => {
    tagNames = data.tags;
  });

  const config = $derived<ClipRenderConfig>({
    ...DEFAULT_CLIP_CONFIG,
    ...((selected.config ?? {}) as Partial<ClipRenderConfig>)
  });

  /** The clip's shape, for the box the preview is drawn in. */
  const previewAspect = $derived(
    config.aspect === '1:1' ? '1 / 1' : config.aspect === '16:9' ? '16 / 9' : '9 / 16'
  );

  const sources = $derived(data.sources);
  /*
   * The beds with their defaults filled in, once, the way `config` is merged
   * with DEFAULT_CLIP_CONFIG above. Every column carries a database default, so
   * every one of them is nullable in the row type and nowhere downstream wants
   * to think about that.
   */
  /** What the clip has to work with, whether or not any of it is placed. */
  const pool = $derived(data.pool);

  const tracks = $derived<TimelineTrack[]>(
    data.audio.map((row) => ({
      id: row.id,
      mediaId: row.mediaId,
      // Resolved once, here, because both the list and the timeline want to
      // write the track's name and neither should be looking it up itself.
      label: mediaById.get(row.mediaId)?.filename ?? 'Missing track',
      // So the timeline can stop a bed being stretched past the audio it has.
      length: (mediaById.get(row.mediaId)?.durationMs ?? 0) / 1000,
      waveform: mediaById.get(row.mediaId)?.waveformUrl ?? null,
      start: row.start ?? 0,
      end: row.end ?? null,
      seek: row.seek ?? 0,
      fadeIn: row.fadeIn ?? true,
      fadeOut: row.fadeOut ?? true,
      duck: row.duck ?? false,
      lane: row.lane ?? 0
    }))
  );

  const mediaById = $derived(new Map(data.media.map((m) => [m.id, m])));

  // Live job state, refreshed by the poller below; falls back to whatever the
  // page load supplied so a reload mid-render still shows progress.
  let liveJob = $state<JobShape | null>(null);
  const job = $derived(liveJob ?? (data.latestJob as JobShape | null));

  interface JobShape {
    id: number;
    status: string;
    progress: number | null;
    error: string | null;
    log: string | null;
    mediaId: number | null;
  }

  const isRendering = $derived(job?.status === 'queued' || job?.status === 'rendering');

  /**
   * Whether the clip has moved on since the render you're looking at.
   *
   * The same function the renderer records with, over the same pieces, so the
   * two can't develop different ideas of what counts as a change. Unknown —
   * nothing rendered, or rendered before the fingerprint existed — shows
   * nothing, which is the honest answer.
   */
  /** Whether the render is behind the edit, which is what Review cares about. */
  const finalStale = $derived.by(() => {
    if (!outputMedia || !selected.renderFingerprint) return false;
    return (
      renderFingerprint({
        config,
        captions,
        sources,
        audio: tracks,
        defaultGraphicMediaId: data.defaultGraphicMediaId
      }) !== selected.renderFingerprint
    );
  });

  /*
   * One forward action per stage, and both need a render behind them.
   *
   * Neither waits for an approval any more. Approving your own clip recorded no
   * decision anybody could act on: if it isn't right you change it, and if it is
   * you send it out. Review stays, because showing someone is a real act — it
   * just isn't a gate.
   */
  const canSendForReview = $derived(
    !!selected.outputMediaId && !['queued', 'published'].includes(selected.status)
  );
  const canSchedule = $derived(
    !!selected.outputMediaId && !['queued', 'published'].includes(selected.status)
  );
  const outputMedia = $derived(
    selected.outputMediaId ? mediaById.get(selected.outputMediaId) : undefined
  );

  /** Whether the file on disk already is the edit, so there is nothing to make. */
  const renderCurrent = $derived(Boolean(outputMedia) && !finalStale);
  /** Whether a render can be asked for at all. */
  const renderReady = $derived(
    data.renderingAvailable && sources.length > 0 && !isRendering && !renderCurrent
  );

  /**
   * What's selected, which is simply whichever row is open.
   *
   * Derived rather than stored alongside them: a selection and an open row are
   * the same fact, and two copies of one fact eventually disagree — the block
   * ringed on the timeline while a different row is open below it.
   */
  const showing = $derived(
    openSourceId != null
      ? ({ kind: 'clip', id: openSourceId } as const)
      : openTrackId != null
        ? ({ kind: 'audio', id: openTrackId } as const)
        : null
  );

  /**
   * The selected bed. It keeps the render in the pane rather than taking it
   * over — there is nothing to look at, and the render is what its "comes in
   * at" and "ends at" are marked against.
   */
  const selectedTrack = $derived(
    openTrackId != null ? (tracks.find((t) => t.id === openTrackId) ?? null) : null
  );

  /**
   * Whichever player the selection is showing in — the pane for a clip, the
   * bar in the panel for a bed.
   */
  /**
   * The player the transport drives.
   *
   * There is only ever one now. Selecting a shot used to lend the pane to that
   * shot's own file, which meant a second clock, a second scrubber and a
   * picture that disagreed with the strip under it — a still from the middle of
   * one file is not something anyone needs to look at, and it took the clip
   * away to show it. A bed is not in here either: selecting one keeps the clip
   * in the pane, and its own block carries the button that plays it.
   */

  /*
   * How much of the page the strip gets, and whether it gets any.
   *
   * It sized itself to its rows, which is right until it isn't: a clip with
   * four bands wants more than the picture can spare, and one with two wants
   * less than it was given. So the divider above it drags, and the height is
   * remembered per browser — the same preference on a laptop and a monitor
   * would be the wrong one in one of the two places.
   *
   * Null means "as tall as its rows", which is where everyone starts and what
   * most clips never need to change.
   */
  const STRIP_HEIGHT_KEY = 'artistack:clip-strip-height';
  const STRIP_HIDDEN_KEY = 'artistack:clip-strip-hidden';
  const OVERVIEW_KEY = 'artistack:clip-overview';
  const STRIP_MIN = 120;

  /*
   * The strip's zoom, lent up so the tools row can hold it.
   *
   * It is worked out down there — it needs the window's width and the clip's
   * length — but it belongs up here, in the one row of tools, rather than in a
   * cluster of its own that scrolled away with the strip.
   */
  /*
   * The clip's menu, as four parts of making one: what it says, what it is
   * made of, how it looks, and where it goes. A rail rather than a column of
   * cards, so one part is on screen at a time and the picture keeps the rest
   * of the page.
   */
  /*
   * The selected thing. One place asking "what is chosen", rather than the
   * rail, the panel and the verbs each working it out again.
   */
  const chosen = $derived(selection.current);

  const SECTIONS = [
    { id: 'post' as const, label: 'Content', icon: PencilSquare },
    { id: 'media' as const, label: 'Media', icon: Film },
    { id: 'frame' as const, label: 'Frame', icon: Photo },
    { id: 'look' as const, label: 'Effects', icon: Sparkles },
    { id: 'send' as const, label: 'Send', icon: PaperAirplane }
  ];

  /**
   * Not one of the steps, so not in the line of them.
   *
   * The five above are the job, in order. The numbers behind everything —
   * branding placement, audio timings, caption maths, the encoder — are the
   * drawer you open twice a year, and they were three doors down inside
   * Effects, which is not where any of them belong. Its own entry at the foot
   * of the rail says both things at once: reachable, and not on the way.
   */
  const ADVANCED_SECTION = {
    id: 'advanced' as const,
    label: 'Advanced',
    icon: AdjustmentsHorizontal
  };

  let section = $state<'post' | 'media' | 'frame' | 'look' | 'send' | 'advanced'>('post');

  /*
   * Whether the panel beside the rail is out.
   *
   * Pressing the section you are already in puts it away, which is how a rail
   * of this kind behaves everywhere: the icon is both where you go and the way
   * back. Closed, the column is the rail alone and the picture takes the rest.
   */
  const PANEL_KEY = 'artistack:clip-panel';
  let panelOpen = $state(true);

  $effect(() => {
    panelOpen = localStorage.getItem(PANEL_KEY) !== '0';
  });

  $effect(() => {
    localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0');
  });

  /**
   * What is in your hand, named and drawn.
   *
   * It was an entry at the head of the rail, which is where it went when the
   * selection borrowed the rail's panel. It has its own column now, so the
   * name and the icon belong to that column's heading instead — the rail is
   * back to being the five parts of a clip and nothing that comes and goes.
   */
  const selectionName = $derived(
    chosen?.kind === 'clip'
      ? 'Shot'
      : chosen?.kind === 'audio'
        ? 'Music'
        : chosen?.kind === 'caption'
          ? 'Caption'
          : 'Effect'
  );

  /**
   * The colour the strip draws this kind of block in.
   *
   * The panel and the block are the same thing seen twice, and until now only
   * one of them said so. A caption is violet on the strip, a bed emerald, a
   * shot grey — so the heading over its settings is too, and the eye can get
   * from the block it pressed to the column that answered without reading
   * either.
   */
  const selectionTint = $derived(
    chosen?.kind === 'caption'
      ? 'border-violet-400/40 bg-violet-500/20'
      : chosen?.kind === 'audio'
        ? 'border-emerald-400/40 bg-emerald-500/20'
        : chosen?.kind === 'clip'
          ? 'border-gray-400/40 bg-gray-500/20'
          : 'border-gray-400/40 bg-gray-600/25'
  );

  const selectionIcon = $derived(
    chosen?.kind === 'clip'
      ? Film
      : chosen?.kind === 'audio'
        ? MusicalNote
        : chosen?.kind === 'caption'
          ? ChatBubbleBottomCenterText
          : Sparkles
  );

  const railSections = SECTIONS;

  /*
   * Selecting something shows it.
   *
   * The panel follows what is in your hand, which is the whole point of it —
   * and going back to nothing selected hands the panel back to whatever clip
   * section you were in rather than leaving an empty column.
   */
  function openSection(id: typeof section) {
    if (section === id) panelOpen = !panelOpen;
    else {
      section = id;
      panelOpen = true;
    }
  }

  let zoomTools = $state<ZoomTools | null>(null);

  let stripBox = $state<HTMLDivElement>();
  let stripHeight = $state<number | null>(null);
  let stripHidden = $state(false);
  /** The bar over the strip showing the whole clip at once. */
  let overview = $state(true);

  // Reads nothing reactive, so it runs once, where localStorage exists.
  $effect(() => {
    const saved = Number(localStorage.getItem(STRIP_HEIGHT_KEY));
    stripHeight = Number.isFinite(saved) && saved >= STRIP_MIN ? saved : null;
    stripHidden = localStorage.getItem(STRIP_HIDDEN_KEY) === '1';
    overview = localStorage.getItem(OVERVIEW_KEY) !== '0';
  });

  $effect(() => {
    if (stripHeight === null) localStorage.removeItem(STRIP_HEIGHT_KEY);
    else localStorage.setItem(STRIP_HEIGHT_KEY, String(Math.round(stripHeight)));
  });

  $effect(() => {
    localStorage.setItem(STRIP_HIDDEN_KEY, stripHidden ? '1' : '0');
  });

  $effect(() => {
    localStorage.setItem(OVERVIEW_KEY, overview ? '1' : '0');
  });

  /**
   * The divider, dragged.
   *
   * Upwards is taller, which is the direction the strip grows. Capped at two
   * thirds of the window so the picture can't be squeezed out entirely, and at
   * `STRIP_MIN` so it can't be dragged shut — shutting it is the button's job,
   * and a strip two pixels tall is a strip nobody can get back.
   */
  function resizeStrip(event: PointerEvent, from: number) {
    const startY = event.clientY;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const wanted = from + (startY - e.clientY);
      stripHeight = Math.min(Math.max(wanted, STRIP_MIN), window.innerHeight * 0.66);
    };
    const done = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  /** Said rather than left to be guessed, when the transport can't do anything. */
  const nothingToPlay = $derived(
    sources.length === 0 ? 'Put some footage on the strip first' : 'Nothing rendered yet'
  );

  /**
   * Takes a placement off the timeline, with a way back.
   *
   * One implementation, because it is now asked for from two places — the row
   * in Sources and the block's own menu — and an undo that only works from one
   * of them is worse than no undo at all.
   */
  async function dropSource(id: number) {
    const source = sources.find((s) => s.id === id);
    if (!source) return;
    // Captured before it goes: after the reload there is nothing left to
    // describe what was removed.
    const gone = { ...source };
    if (openSourceId === id) selection.clear();
    const done = await autosave.run('the removed clip', () => removeSource(id));
    await invalidateAll();
    if (done === undefined) return;
    toast.undoable('Clip removed', async () => {
      await autosave.run('the restored clip', () => restoreSource(gone));
      await invalidateAll();
    });
  }

  /** Same, for a bed. */
  async function dropTrack(id: number) {
    // The stored row rather than the normalised one the list draws from:
    // restoring has to put back what was there, nulls and all, not the defaults
    // filled in over them.
    const gone = data.audio.find((a) => a.id === id);
    if (openTrackId === id) selection.clear();
    const done = await autosave.run('the removed track', () => removeAudio(id));
    await invalidateAll();
    if (done === undefined || !gone) return;
    toast.undoable('Track removed', async () => {
      await autosave.run('the restored track', () => restoreAudio(gone));
      await invalidateAll();
    });
  }

  /**
   * The clip's look at wherever the playhead is, as CSS.
   *
   * Asked per frame rather than once, because a look can have a rhythm — a
   * dropout tears for a tenth of a second and is gone — and the preview is
   * scrubbed rather than played, so it has to answer for the moment on screen.
   *
   * The SVG halves are referenced after the plain filter functions, which puts
   * them in the order the render runs them: the grade, then the curves, the
   * channel split and the softness.
   *
   * Dimensions are the nominal frame, so an offset stated in render pixels
   * comes out as the same share of the picture here as it does in the file.
   */
  const look = $derived.by(() => {
    const frame =
      config.aspect === '1:1'
        ? { width: 1080, height: 1080 }
        : config.aspect === '16:9'
          ? { width: 1920, height: 1080 }
          : { width: 1080, height: 1920 };
    const drawn = pictureCss(
      config,
      { ...frame, fps: advanced.fps, duration: layout.duration },
      clock.at
    );
    const refs = drawn.svg.map((_, index) => `url(#footage-look-${index})`).join(' ');
    return {
      frame,
      filter: [drawn.filter, refs].filter(Boolean).join(' '),
      /*
       * A move is a transform on the picture, not a filter over it, so it is
       * carried separately and applied as one — the same bargain the captions
       * and the grade already make: shown live in the browser rather than
       * charged as a render every time the dial moves.
       */
      transform: drawn.transform,
      svg: drawn.svg,
      overlay: drawn.overlay
    };
  });

  /**
   * The look as one inline style.
   *
   * Both players show it — the stage and a lone source — and each had its own
   * ternary. A move needed a second property in both, which is two chances to
   * add it twice and once not at all.
   */
  const lookStyle = $derived(
    [look.filter && `filter: ${look.filter}`, look.transform && `transform: ${look.transform}`]
      .filter(Boolean)
      .join('; ') || undefined
  );

  /**
   * How long the opening logo stays up, worked out the way the renderer does.
   *
   * Its own read of the same dials rather than a number passed back from a
   * render, because the overlay has to be right for an edit that hasn't been
   * rendered yet — which is the whole point of it.
   */
  const introShown = $derived.by(() => {
    const a = advanced;
    if (!config.intro) return 0;
    // Said outright, on the strip. The dials below are only for when it wasn't.
    if (a.introFixedSeconds != null && a.introFixedSeconds > 0) return a.introFixedSeconds;

    const first = timelineClips[0];
    const length = first ? first.end - first.start : 0;
    if (!length) return a.introFallbackSeconds;

    // Never more than 60% of the first clip, so something plays after it —
    // INTRO_MAX_SHARE in the renderer, and the same number here on purpose.
    const scaled = Math.min(
      Math.max(length * a.introPercent, a.introMinSeconds),
      a.introMaxSeconds
    );
    return Math.min(scaled, length * 0.6);
  });

  /** The pooled file whose footage is being turned, if any. */
  let turningId = $state<number | null>(null);

  /**
   * Which picture is in the pane: the edit, or the file that went out.
   *
   * Preview is the clip playing itself, live. Full is the render — the file
   * anything downstream touches. It sits in the transport row now, beside
   * play, because which picture is on screen is part of watching rather than
   * part of sending.
   *
   * Shown before a render exists, which it wasn't. Full is where rendering
   * lives now: empty, it is the button that makes the first one, and that is a
   * better place for it than a column about what happens afterwards.
   *
   * Not remembered between visits: the edit is what you came here for.
   */
  let watching = $state<'edit' | 'render'>('edit');

  const watchingRender = $derived(watching === 'render');
  const canSwitchView = $derived(sources.length > 0);

  /**
   * Where the clip has got to, as a sentence.
   *
   * `Rendered` and `edited since this render` are both true and neither says
   * what to do about it. The states are a handful, so each gets its own
   * wording: what has happened, and — when the finished file is behind the
   * edit — what that means for the thing about to go out.
   */
  const statusLine = $derived.by(() => {
    const where: Record<string, string> = {
      draft: 'Not rendered yet',
      rendered: 'Rendered and ready to send out',
      review: 'Sent for review',
      queued: 'Waiting to go out',
      published: 'Published'
    };
    /*
     * Where the clip is, and nothing about the render being behind.
     *
     * That was said here, on the Render button, and by the dot on the Full tab
     * — three times, and this was the only one of the three that couldn't be
     * acted on. The button underneath is enabled exactly when there is
     * something to render, which says it and does it in one place. The dot
     * beside this line still goes amber, silently.
     */
    return where[selected.status] ?? selected.status;
  });

  /**
   * Where everything sits, worked out from the edit rather than from a render.
   *
   * So the timeline is true while you're building the clip, not only after
   * you've made one — which is when arranging actually happens.
   */
  const layout = $derived(
    clipLayout(
      sources.map((source) => ({
        id: source.id,
        mediaId: source.mediaId,
        start: source.start ?? 0,
        lane: source.lane ?? 0,
        trimStart: source.trimStart,
        trimEnd: source.trimEnd,
        length: (mediaById.get(source.mediaId)?.durationMs ?? 0) / 1000
      })),
      config,
      config.advanced,
      // A caption or a bed can be the last thing on the clip, and then it is
      // what the clip's length means. Open-ended beds are excluded: they run
      // until the clip does, so they can't be what decides it.
      Math.max(
        0,
        ...((selected.captions ?? []) as TimedCaption[]).map((c) => c.end),
        ...data.audio.map((a) => a.end ?? 0)
      )
    )
  );

  /**
   * The clip's own clock, and the shots it plays.
   *
   * The pane used to play a file and everything else read the time off it,
   * which only told the truth while the file and the edit agreed — that is,
   * right after a render and never again. Now the edit is the thing that runs
   * and the pictures follow it.
   */
  const clock = new ClipPlayback();

  /*
   * `untrack`, because these touch the clock and the clock answers back.
   *
   * `pause()` reads whether it is playing and `seek()` reads how long the clip
   * is, so an effect that calls either picks up a dependency on the very state
   * it is setting: pressing play re-ran this and it stopped the clock again,
   * within the same frame, for as long as anyone cared to keep pressing.
   */
  /** The rendered file in the pane, when Full is the one being watched. */
  let renderEl = $state<HTMLVideoElement | null>(null);
  /** How long that file turned out to be, which is the truth while you watch it. */
  let renderLength = $state(0);

  /**
   * The file follows the clock, the way the shots do.
   *
   * Full used to be a video element with its own controls: its own play, its
   * own scrubber, its own idea of the time — two of everything on screen, and
   * neither aware of the other. There is one transport in this editor and one
   * clock behind it; what differs between Preview and Full is which picture is
   * made to agree with it.
   */
  $effect(() => {
    const el = renderEl;
    if (!el || !watchingRender) return;

    const at = clock.at;
    const running = clock.playing;

    // The same room level the edit plays at, so switching between the two
    // pictures isn't also a change in volume.
    el.volume = monitor.level;

    // A quarter of a second of slack: a video seeks in whole keyframes and
    // correcting every frame would stutter more than the drift shows.
    if (Math.abs(el.currentTime - at) > 0.25) el.currentTime = at;
    if (running && el.paused) void el.play().catch(() => {});
    if (!running && !el.paused) el.pause();
  });

  // Switching away from it stops it: a file playing behind the edit is sound
  // from nowhere.
  $effect(() => {
    if (watchingRender) return;
    const el = renderEl;
    if (el && !el.paused) el.pause();
  });

  $effect(() => {
    /*
     * While Full is up, the file's own length is the length.
     *
     * The edit is the authority everywhere else, but a render made from an
     * older edit is its own thing, and parking the playhead short of its last
     * half-second because the clip has since been trimmed is a transport
     * lying about what it is playing.
     */
    const length = watchingRender && renderLength > 0 ? renderLength : layout.duration;
    untrack(() => {
      clock.duration = length;
      // A shot taken off the end can leave the playhead past the end of the clip.
      if (clock.at > length) clock.seek(length);
    });
  });

  /**
   * Picking something shows it.
   *
   * Only when it isn't already on screen. Scrubbing inside a shot and then
   * pressing it to change its look should leave the playhead where you were
   * looking — the frame you are judging is the one you chose. Picking
   * something the playhead is nowhere near is the opposite: the panel fills
   * with settings for a thing the picture cannot show, and the first thing
   * anyone does is go and find it.
   *
   * Its start — or a moment past it, for the things that arrive.
   *
   * A caption's first frame is, by design, a caption you cannot see: an
   * entrance starts from nothing and takes about a third of a second to be
   * there. Landing exactly on it showed an empty picture and read as the
   * caption being broken. Shots and beds keep the exact start, because a cut
   * is judged on its first frame and that frame is already whatever it is.
   */
  $effect(() => {
    const what = chosen;
    if (!what) return;

    const span =
      what.kind === 'clip'
        ? (timelineClips.find((block) => block.id === what.id) ?? null)
        : what.kind === 'audio'
          ? (tracks.find((bed) => bed.id === what.id) ?? null)
          : what.kind === 'caption'
            ? (captions[what.index] ?? null)
            : (placedEffects[what.index] ?? null);
    if (!span) return;

    const from = span.start ?? 0;
    // A bed or an effect with no end of its own runs until the clip does.
    const to = span.end ?? layout.duration;

    /*
     * Far enough in to have arrived, never more than a quarter of the way
     * through — a caption half a second long would otherwise be shown at its
     * halfway point rather than at its beginning.
     */
    const arrives = what.kind === 'caption' || what.kind === 'fx';
    const at = arrives ? from + Math.min(0.3, (to - from) / 4) : from;

    untrack(() => {
      /*
       * Picking something to edit means looking at the edit.
       *
       * The render is a file from some minutes ago with its captions burned
       * into it; nothing you select can change what it shows. Left on it, the
       * playhead would obediently move to the caption you pressed and the
       * picture would carry on showing the old one — or none, if it was
       * written since.
       */
      watching = 'edit';

      if (clock.at >= from && clock.at < to) return;
      clock.seek(at);
    });
  });

  /**
   * A different clip is a different timeline; nobody means to land mid-way.
   *
   * Guarded on the id having actually changed, because `selected` is rebuilt
   * every time the page's data is reloaded — which is after every autosave. As
   * a bare effect this sent the playhead back to the top each time anything was
   * typed, while it was playing.
   */
  let playingClip: number | null = null;
  $effect(() => {
    const id = selected.id;
    if (playingClip === null) {
      playingClip = id;
      return;
    }
    if (id === playingClip) return;
    playingClip = id;
    untrack(() => {
      clock.pause();
      clock.seek(0);
    });
  });

  const timelineClips = $derived<TimelineClip[]>(
    layout.blocks.map((block) => {
      const source = sources.find((s) => s.id === block.id);
      const item = mediaById.get(block.mediaId);
      const length = (item?.durationMs ?? 0) / 1000;
      const speed = config.speed || 1;

      /*
       * What's left of the file either side of the window in use, converted to
       * timeline seconds — which is what the block is drawn in, and so what its
       * edges can be clamped against.
       */
      const head = source?.trimStart ?? 0;
      const tail = Math.max(0, length - (source?.trimEnd ?? length));

      return {
        ...block,
        label: item?.filename ?? 'Missing file',
        poster: item?.thumbnailUrl ?? null,
        headroom: head / speed,
        tailroom: tail / speed,
        from: head,
        to: source?.trimEnd ?? length,
        length,
        speed,
        muted: source?.muted ?? false,
        fadeIn: source?.fadeIn ?? false,
        fadeOut: source?.fadeOut ?? false,
        dissolveHead: source?.dissolveHead ?? null,
        still: Boolean(item?.mimeType?.startsWith('image/')),
        fit: (source?.fit as 'crop' | 'black' | 'blur' | null) ?? null,
        zoom: source?.zoom ?? 1,
        pan: source?.pan ?? false
      };
    })
  );

  /**
   * The beds, as the player needs them.
   *
   * Every bed, not the selected one: the clip plays its own score now, so the
   * music under the picture is the music that will be in the file.
   */
  /**
   * How far the preview's clock runs ahead of the strip's.
   *
   * An intro with a run-up puts time at the head that the arrangement knows
   * nothing about — so the clock counts from the first frame of the clip and
   * the strip counts from the first frame of footage, and the two disagree by
   * this much.
   *
   * Everything handed to the picture is moved along by it rather than the
   * clock being moved back: the stage, the beds and the overlay all read the
   * same clock, and one of them being told a different time is how a preview
   * drifts out of step with itself.
   */
  const lead = $derived(layout.lead);

  const stageBeds = $derived<StageBed[]>(
    tracks.map((track) => ({
      id: track.id,
      url: mediaById.get(track.mediaId)?.url ?? '',
      start: track.start + lead,
      end: track.end == null ? track.end : track.end + lead,
      seek: track.seek,
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut,
      duck: track.duck,
      length: track.length
    }))
  );

  /**
   * Whether a shot is making a sound under the playhead, which is what a ducked
   * bed gets out of the way of.
   */
  const footageAudible = $derived.by(() => {
    if (config.musicOnly) return false;
    return stageShots.some(
      (shot) => !shot.muted && !shot.still && clock.at >= shot.start && clock.at < shot.end
    );
  });

  /**
   * The shots, as the stage needs them: the proxy to play, and where in it.
   *
   * Off the same layout the strip is drawn from, so the picture and the blocks
   * can't disagree about when anything happens — that disagreement was the
   * whole reason a render had to exist before you could judge an edit.
   */
  const stageShots = $derived<StageShot[]>(
    timelineClips.map((block) => {
      const source = sources.find((row) => row.id === block.id);
      const item = mediaById.get(block.mediaId);
      return {
        id: block.id,
        start: block.start + lead,
        end: block.end + lead,
        from: block.from,
        speed: block.speed,
        // The proxy, which is why it exists: a 4K phone file decoding twice
        // over a cut is a laptop fan, not a preview.
        url: (block.still ? item?.url : (item?.previewUrl ?? item?.url)) ?? '',
        still: block.still,
        muted: block.muted,
        rotation: source?.rotation ?? 0,
        fit: block.fit,
        zoom: block.zoom,
        pan: block.pan,
        fadeIn: block.fadeIn,
        fadeOut: block.fadeOut,
        width: item?.width ?? null,
        height: item?.height ?? null,
        alt: item?.alt ?? item?.filename ?? null,
        effects: shotEffects(source?.effects)
      };
    })
  );

  // Poll while a render is in flight. ffmpeg reports progress into the job row,
  // so this is the only way the UI learns about it.
  //
  // `refresh()`, not `await getRenderStatus(id)` — and that is the whole poll.
  // A remote query memoises its promise per argument and hands every later
  // caller the same one, so awaiting it on a timer re-reads one answer forever:
  // the bar froze at whatever progress the first tick caught, and a render
  // started just after a finished one was told the old job was done and put the
  // button back. `refresh()` is the documented way to ask the server again.
  $effect(() => {
    if (!isRendering) return;
    const status = getRenderStatus(selected.id);

    const timer = setInterval(async () => {
      try {
        await status.refresh();
        const job = status.current as JobShape | null;
        liveJob = job;
        // A finished render adds a media row and sets outputMediaId, neither of
        // which is in the current page data.
        if (job && job.status !== 'queued' && job.status !== 'rendering') {
          await invalidateAll();
        }
      } catch {
        // A dropped poll is harmless; the next tick retries.
      }
    }, 1500);

    return () => clearInterval(timer);
  });

  let deleteConfirmOpen = $state(false);

  async function handleDelete(id: number) {
    deleteConfirmOpen = false;
    const gone = await attempt('Could not delete the clip', () => deleteProject(id));
    if (gone === undefined) return;
    toast.success('Deleted');
    await goto('/admin/clips');
  }

  /**
   * Stores this field's text as the boilerplate new clips start with. Saving an
   * empty field clears the default rather than storing nothing useful.
   */
  async function handleSaveDefault(field: 'tags' | 'description') {
    const result = await attempt(`Could not save the default ${field}`, () =>
      field === 'tags' ? saveClipDefaultTags(tagNames) : saveClipDefaultDescription(captionText)
    );
    if (!result) return;
    if (!result.success) {
      toast.error('Could not save the default');
      return;
    }
    toast.success(result.cleared ? `Default ${field} cleared` : `Saved as the default ${field}`);
  }

  /**
   * An action that isn't a save — it deletes, approves, publishes, copies.
   *
   * Same defect as the silent autosave, different words: a rejected promise in
   * an event handler goes nowhere, so a lost connection halfway through
   * approving a clip looked like nothing happening at all. These aren't
   * retryable the way a field is — you press the button again — so they only
   * need to be heard.
   */
  async function attempt<T>(whatFailed: string, run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (e) {
      const detail = e instanceof Error && e.message ? ` — ${e.message}` : '';
      toast.error(`${whatFailed}${detail}`);
      return undefined;
    }
  }

  /**
   * Saves a set of project fields.
   *
   * `what` names the thing for the failure message, so it reads as "Couldn't
   * save the caption" rather than as an error code.
   *
   * A failed save deliberately skips the reload. The server still holds the old
   * value, so refreshing would wipe what you typed off the screen and leave you
   * with an apology and nothing to retry — the unsaved edit stays put instead,
   * which is also what makes Try again mean anything.
   */
  async function patch(what: string, fields: Record<string, unknown>) {
    const saved = await autosave.run(what, () => updateProject({ id: selected.id, ...fields }));
    if (saved !== undefined) await invalidateAll();
    return saved !== undefined;
  }

  async function patchConfig(what: string, changes: Partial<ClipRenderConfig>) {
    await patch(what, { config: changes });
  }

  // Advanced dials are merged server-side, so sending one field leaves the rest
  // untouched. Per clip, deliberately: this panel is the settings that have no
  // other home, and a setting with no other home is one you set where you are.
  async function patchAdvanced(changes: Partial<ClipAdvancedConfig>) {
    return await patch('the advanced settings', { config: { advanced: changes } });
  }

  /*
   * The kept colours, and keeping one.
   *
   * Derived from the layout's copy so a reload is picked up, written over with
   * what the save returns so the swatch appears on the press. The same shelf
   * the appearance screen fills — a colour worth using on a caption is usually
   * one worth having on the next clip too.
   */
  let brandColors = $derived<string[]>(data.brandColors ?? []);

  async function keep(color: string) {
    const result = await keepColor(color);
    brandColors = result.colors;
  }

  /**
   * The brand colour, resolved the way the render resolves it.
   *
   * The clip's own if it has one, then the site's, then violet — the same chain
   * as `render-queue`, so the preview and the file agree about what the brand
   * is.
   */
  const accent = $derived(config.logoColor || data.settings?.colorAccent || '#8b5cf6');

  /** The dials as they are saved, which is what each field shows. */
  const savedAdvanced = $derived<ClipAdvancedConfig>({
    ...DEFAULT_ADVANCED_CONFIG,
    ...(config.advanced ?? {})
  });

  /*
   * A dial you are still turning.
   *
   * The fields commit on blur, which is right for the database and wrong for
   * the eye: `Caption top (% up)` is a number whose only meaning is where the
   * caption lands, and nobody can judge 42 by reading it. Keystrokes land here
   * at once so the preview moves under your hands, while the save still happens
   * once, on the way out.
   *
   * Deliberately not fed back into the field's own `value`. Round-tripping a
   * half-typed number through `Number()` turns "1." into "1" and eats the dot
   * you were about to type after it; the input keeps its own text, and this
   * only tells everything else what that text currently means.
   *
   * A failed save leaves the draft standing, the same bargain `patch` makes
   * everywhere else — what you can see is what you last asked for.
   */
  let advancedDraft = $state<Partial<ClipAdvancedConfig>>({});

  /** The dials as the preview should draw them: saved, then whatever is in hand. */
  const advanced = $derived<ClipAdvancedConfig>({ ...savedAdvanced, ...advancedDraft });

  /*
   * The caption face being looked at, which is not yet the one chosen.
   *
   * Arrowing through the font list draws each one on the picture without
   * saving anything — `undefined` means nothing is being looked at. Only the
   * overlay reads this; everything else, the fingerprint included, goes on
   * seeing the face that was actually chosen, because looking at a font is not
   * a change to the clip.
   */
  let peekCaptionFont = $state<string | null | undefined>(undefined);

  const previewConfig = $derived<ClipRenderConfig>(
    peekCaptionFont === undefined ? config : { ...config, captionFont: peekCaptionFont ?? '' }
  );

  /**
   * Which advanced dials differ from the engine defaults, counted over the ones
   * actually on screen. A field the panel doesn't offer could still hold an
   * override from an older project, and reporting one the user can neither see
   * nor reset would just be a puzzle.
   */
  const changedAdvanced = $derived(
    ADVANCED_GROUPS.flatMap((group) => group.fields).filter(
      (field) => advanced[field.key] !== DEFAULT_ADVANCED_CONFIG[field.key]
    ).length
  );

  /**
   * The Look grid. Labels say what you'd see rather than what the field is
   * called: "Caption box" described the ASS border style, not the effect.
   *
   * The two caption entries answer for the captions that haven't answered for
   * themselves — each block can overrule them — so their hints say so. A toggle
   * that looks like it governs every caption and governs only some of them is
   * worse than one that admits it. They stay because a caption effect is an
   * entrance or a fault; neither has anything to say about colour or a panel.
   *
   * Film grain and Vignette have gone, along with Tone above. Every footage
   * effect brings its own grade, its own noise and in some cases its own
   * vignette, so these were a second way to decide the picture and the two
   * stacked into something muddier than either — two vignettes and two lots of
   * grain if you used a preset and a look together. What they could do that no
   * effect could is now the Texture effect, which is grain and a vignette with
   * the colour left alone.
   *
   * The fields are still read by the renderer, so a clip that already has them
   * on looks exactly as it did. Nothing switches them back on, and any preset
   * turns them off.
   */
  /**
   * The clip-wide switches, in four groups that each name a subject.
   *
   * They were one flat grid of nine, which read left to right as captions,
   * then motion, then picture, then sound, with nothing saying where one ended
   * and the next began — "Caption backdrop" sat next to "Slow zoom" and the
   * only way to tell them apart was to already know. The groups are what makes
   * it scannable; the order within each is unchanged.
   *
   * Labels say what you'd see rather than what the field is called: "Caption
   * box" described the ASS border style, not the effect.
   */
  type LookGroup = {
    label: string;
    hint?: string;
    options: { key: keyof ClipRenderConfig; label: string; hint: string }[];
  };

  const LOOK_GROUPS: LookGroup[] = [
    {
      label: 'Motion',
      options: [
        /*
         * No crossfade switch. A dissolve is a thing done to one cut — the
         * mark on the join does it, out of the footage either side — and as a
         * clip-wide setting it could only be done by shortening the clip,
         * which left every caption after the join playing late.
         */
        { key: 'zoom', label: 'Slow zoom', hint: 'A slow push in across each clip.' }
      ]
    },
    {
      label: 'Picture',
      options: [
        {
          key: 'videoFadeIn',
          label: 'Fade in',
          hint: 'Fade the picture up from black. Note the opening frame goes black, and that is the frame every platform grabs for the cover.'
        },
        { key: 'videoFadeOut', label: 'Fade out', hint: 'Fade the picture out at the end.' }
      ]
    },
    {
      label: 'Sound',
      options: [
        { key: 'audioFadeIn', label: 'Fade in', hint: 'Fade the audio up at the start.' },
        { key: 'audioFadeOut', label: 'Fade out', hint: 'Fade the audio down at the end.' },
        {
          key: 'loudnorm',
          label: 'Normalise loudness',
          hint: 'Match the -14 LUFS level every platform normalises to anyway.'
        }
      ]
    }
  ];

  const BRANDING_OPTIONS: { key: keyof ClipRenderConfig; label: string; hint: string }[] = [
    { key: 'intro', label: 'Intro', hint: 'The graphic animates in over the opening.' },
    { key: 'watermark', label: 'Watermark', hint: 'A small corner mark for the whole clip.' },
    {
      key: 'outro',
      label: 'Outro',
      hint: 'Dissolve out to a card showing the graphic at the end.'
    }
  ];

  /**
   * Whether the branding row's graphic list is showing, and what to measure a
   * click against — the same outside-click and Escape behaviour every other
   * menu here has.
   */

  /**
   * The graphic each stage will actually draw with, for its chip and the overlay.
   *
   * The site default when the stage has no mark of its own — the same fallback
   * the renderer applies, so the chip shows what will come out.
   */
  /**
   * How long a mark is on screen with no footage under it.
   *
   * Which is the only time it has a background at all: lying over the picture,
   * the picture is its background. Zero means the question doesn't arise.
   */
  const outsideFootage = $derived((stage: BrandStage) =>
    stage === 'intro'
      ? Math.max(0, advanced.introLeadSeconds ?? 0)
      : stage === 'outro'
        ? Math.max(
            0,
            advanced.outroSeconds - Math.min(advanced.outroOverlapSeconds, advanced.outroSeconds)
          )
        : 0
  );

  /** Which stage's colour wheel is out, since the three share one row shape. */
  let colourOpen = $state<BrandStage | null>(null);

  const stageGraphic = $derived((stage: BrandStage) => {
    const id = stageGraphicId(config, stage) ?? data.defaultGraphicMediaId;
    return id ? (data.graphics.find((g) => g.id === id) ?? null) : null;
  });

  let showCustomise = $state(false);

  /**
   * The preset whose every named option currently matches the config, if any.
   *
   * A preset only sets the options it names, so this compares just those —
   * checking the whole config would never match once you'd touched anything
   * a preset leaves alone, like aspect or music.
   */
  /**
   * The look a clip and a preset are each asking for, as one comparable thing.
   *
   * Everything a preset names is a boolean or a word except the effects, which
   * are a list of objects — and `===` on two arrays is a question about
   * identity, not about contents, so it is false however alike they are. A
   * preset naming a look would have applied perfectly and then never shown as
   * the active one.
   *
   * Only the clip-wide entry counts. A preset speaks for what the whole clip
   * looks like; a tear dragged onto the chorus is not part of that and should
   * not stop Cinematic saying it is Cinematic.
   */
  const lookOf = (effects?: PlacedEffect[]) => {
    const wide = (effects ?? []).find((e) => e.start == null && e.end == null);
    return wide ? JSON.stringify({ id: wide.id, params: wide.params ?? {} }) : '';
  };

  const activePreset = $derived(
    CLIP_PRESETS.find((preset) =>
      (Object.keys(preset.config) as (keyof ClipRenderConfig)[]).every((key) =>
        key === 'effects'
          ? lookOf(config.effects) === lookOf(preset.config.effects)
          : config[key] === preset.config[key]
      )
    )?.id ?? null
  );

  /**
   * Applies a preset, or takes it off again if it is the one already on.
   *
   * Turning one off means putting back the defaults for exactly the keys it
   * names, which is what the old `clean` preset did by hand — and since a new
   * project already carries those defaults, having both a way to switch a
   * preset off and a preset that switches everything off was saying the same
   * thing twice, in a tile that could hold a look instead.
   */
  async function applyPreset(presetId: string) {
    const preset = CLIP_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const off = activePreset === presetId;
    const wanted = off
      ? (Object.fromEntries(
          Object.keys(preset.config).map((key) => [
            key,
            DEFAULT_CLIP_CONFIG[key as keyof ClipRenderConfig]
          ])
        ) as Partial<ClipRenderConfig>)
      : preset.config;

    const patch: Partial<ClipRenderConfig> = { ...wanted };
    if (patch.effects) {
      /*
       * A preset replaces the clip's look and keeps everything placed.
       *
       * Taking the list wholesale would mean pressing Clean deleted a tear you
       * had dragged onto a beat — which is not a change of look, it is losing
       * work. The same division the Look panel and the effects lane already
       * observe: one owns the clip-wide entry, the other owns the placed ones.
       */
      patch.effects = [
        ...(config.effects ?? []).filter((e) => e.start != null || e.end != null),
        ...patch.effects
      ];
      patch.pictureEffect = null;
    } else if (off) {
      // The default for `effects` is nothing at all, and "nothing at all" still
      // has to leave the placed ones where they are.
      patch.effects = (config.effects ?? []).filter((e) => e.start != null || e.end != null);
      patch.pictureEffect = null;
    }
    await patchConfig('the preset', patch);
    toast.success(off ? `${preset.label} turned off` : `${preset.label} applied`);
  }

  /*
   * Reset means "hold no opinion", not "write down the current defaults".
   *
   * It used to send the whole of `DEFAULT_ADVANCED_CONFIG`, which stored
   * forty-two values identical to the constants — and pinned the clip to them,
   * so no later improvement to a default could ever reach it. Sending them is
   * now the same as sending nothing, because the server keeps only what
   * differs; this says so plainly rather than relying on that.
   */
  async function resetAdvanced() {
    if (!confirm('Reset every advanced dial to its default?')) return;
    advancedDraft = {};
    await patchAdvanced({ ...DEFAULT_ADVANCED_CONFIG });
    toast.success('Advanced settings reset');
  }

  /**
   * Everything picked goes into the pool, and lands on the strip behind it.
   *
   * Adding and placing used to be two steps on purpose: they are different
   * decisions, and welding them together is what made using one shot twice
   * mean picking it twice. But the first half of that argument only holds once
   * you know there *is* a strip — before then "Added 3 files — place them on
   * the timeline" is a instruction with no visible verb, and the editor sits
   * empty beside a list of things that are already in it.
   *
   * So the common case happens by itself: anything new goes on the end, in the
   * order it was picked, footage after footage and music under it. Using one
   * shot twice is still the pool's button, which is where it always was, and
   * anything landing somewhere unwanted is a drag or a Delete away.
   */
  async function handleAddMedia(ids: number[]) {
    if (!selected || ids.length === 0) return;

    /*
     * Footage, music and stills. A picture held for a few seconds is a shot
     * like any other, so it goes in the pool beside the video rather than
     * being dropped on the way in — which is what happened when this list was
     * video and audio only, silently and with a success message.
     */
    const picked = ids
      .map((id) => data.media.find((m) => m.id === id))
      .filter((m): m is (typeof data.media)[number] =>
        Boolean(
          m?.mimeType?.startsWith('video/') ||
          m?.mimeType?.startsWith('audio/') ||
          m?.mimeType?.startsWith('image/')
        )
      );
    if (picked.length === 0) return;

    // Taken before the add, not after: once the pool has them it can no longer
    // say which ones it just gained, and placing the lot would give a file the
    // clip already held a second block nobody asked for.
    const held = new Set(pool.map((entry) => entry.mediaId));

    const result = await autosave.run('the media', () =>
      addToPool({ projectId: selected.id, mediaIds: picked.map((m) => m.id) })
    );
    await invalidateAll();

    if (result === undefined) return;
    const added = result.added ?? 0;
    if (added === 0) {
      toast.success('Already in this clip');
      return;
    }

    // Only what wasn't already here: picking a file the clip already holds is
    // how you ask for a second placement, and that is the pool's own button.
    const fresh = picked.filter((m) => !held.has(m.id));

    if (fresh.length) {
      const projectId = selected.id;
      await autosave.run('the placement', async () => {
        // One at a time: each lands after the last, and the order they were
        // picked in is the order they play in.
        for (const item of fresh) {
          if (item.mimeType?.startsWith('audio/'))
            await placeAudio({ projectId, mediaId: item.id });
          else await placeSource({ projectId, mediaId: item.id });
        }
      });
      await invalidateAll();
    }

    toast.success(`Added ${added} file${added > 1 ? 's' : ''} to the timeline`);
  }

  /** Puts a pooled file on the strip, after everything already there. */
  async function placeInTimeline(mediaId: number, isAudio: boolean) {
    if (!selected) return;
    const projectId = selected.id;
    await autosave.run('the placement', async () => {
      if (isAudio) await placeAudio({ projectId, mediaId });
      else await placeSource({ projectId, mediaId });
    });
    await invalidateAll();
  }

  /**
   * Drops a file from the clip, and every block made from it.
   *
   * Both together, because a placement pointing at something the project no
   * longer has is a worse state than either having it or not — and both come
   * back together too.
   */
  async function dropFromPool(mediaId: number, name: string, uses: number) {
    if (!selected) return;
    const projectId = selected.id;
    const removed = await autosave.run('the removed media', () =>
      removeFromPool({ projectId, mediaId })
    );
    await invalidateAll();
    if (removed === undefined) return;

    toast.undoable(
      uses > 0
        ? `Removed ${shortName(name)} and ${uses} placement${uses > 1 ? 's' : ''}`
        : `Removed ${shortName(name)}`,
      async () => {
        await autosave.run('the restored media', () =>
          restoreToPool({
            projectId,
            mediaId,
            sources: removed.sources ?? [],
            audio: removed.audio ?? []
          })
        );
        await invalidateAll();
      }
    );
  }

  /** Turns the footage itself, for every block that uses it. */
  async function turnMedia(mediaId: number) {
    if (turningId !== null || !selected) return;
    const projectId = selected.id;
    turningId = mediaId;
    try {
      const result = await autosave.run('the rotation', () =>
        rotateFootage({ projectId, mediaId })
      );
      await invalidateAll();
      if (result && !result.success) toast.error(result.message ?? 'Could not rotate');
    } finally {
      turningId = null;
    }
  }

  const graphicOptions = $derived([
    { value: '', label: 'Site default', hint: 'Whatever is set as default in Media' },
    ...data.graphics.map((g) => ({
      value: String(g.id),
      label: g.filename.replace(/\.[^.]+$/, ''),
      image: g.thumbnailUrl || g.url
    }))
  ]);

  async function handleRender() {
    const result = await attempt('Could not start the render', () =>
      startRender({ projectId: selected.id })
    );
    if (!result) return;
    if (!result.success) {
      toast.error(result.message ?? 'Could not start the render');
      return;
    }
    liveJob = result.job as JobShape;
    toast.success('Render queued');
  }

  async function handleStop() {
    if (!job) return;
    const stopped = await attempt('Could not cancel the render', () => stopRender(job.id));
    if (stopped === undefined) return;
    toast.success('Render cancelled');
  }

  // --- review & release --------------------------------------------------

  /** Whether the "are you sure" is up. See the dialog for why there is one. */
  let reviewConfirmOpen = $state(false);

  async function handleSendForReview() {
    reviewConfirmOpen = false;
    const result = await attempt('Could not send for review', () =>
      sendForReview({
        projectId: selected.id,
        origin: window.location.origin
      })
    );
    if (!result) return;
    if (!result.success) {
      toast.error(result.error ?? 'Could not send for review');
      return;
    }
    await invalidateAll();
    // A webhook failure still leaves a usable preview link, so surface it as a
    // warning rather than swallowing it or calling the whole thing a failure.
    if (result.error) toast.error(result.error);
    else toast.success('Sent for review');
  }

  async function handlePreviewLink(rotate = false) {
    const fn = rotate ? resetPreviewLink : createPreviewLink;
    const result = await attempt('Could not create the preview link', () =>
      fn({ projectId: selected.id, origin: window.location.origin })
    );
    if (!result) return;
    navigator.clipboard.writeText(result.url);
    await invalidateAll();
    toast.success(rotate ? 'New link created and copied' : 'Preview link copied');
  }

  let queueDialogOpen = $state(false);

  async function handleQueueChoice(mode: 'drip' | 'date' | 'now', when: string | null) {
    if (mode === 'now') {
      await handlePublishNow();
      return;
    }

    const alreadyQueued = selected.status === 'queued';

    if (!alreadyQueued) {
      const result = await attempt('Could not queue the clip', () => addToQueue(selected.id));
      if (!result) return;
      if (!result.success) {
        toast.error(result.message ?? 'Could not queue');
        return;
      }
    }

    // Sent even when null, so switching back to the drip clears an old pin.
    const dated = await attempt('Could not set the release date', () =>
      setScheduledDate({ projectId: selected.id, when: fromLocalInput(when) })
    );
    if (dated === undefined) return;
    await invalidateAll();

    toast.success(
      alreadyQueued
        ? 'Release date updated'
        : when
          ? 'Queued for the date you picked'
          : 'Added to the release queue'
    );
  }

  async function handleUnqueue() {
    const removed = await attempt('Could not remove it from the queue', () =>
      removeFromQueue(selected.id)
    );
    if (removed === undefined) return;
    await invalidateAll();
    toast.success('Removed from the queue');
  }

  async function handlePublishNow() {
    const result = await attempt('Could not publish the clip', () =>
      publishNow({ projectId: selected.id, origin: window.location.origin })
    );
    if (!result) return;
    if (!result.success) {
      toast.error(result.error ?? 'Publish failed');
      return;
    }
    await invalidateAll();
    toast.success('Published');
  }

  // --- timed captions ---------------------------------------------------

  const captions = $derived((selected.captions ?? []) as TimedCaption[]);
  /** The same, for one caption asking to see a face of its own. */
  let peekCaptionFace = $state<{ index: number; id: string | null } | null>(null);

  const previewCaptions = $derived(
    (peekCaptionFace
      ? captions.map((line, i) =>
          i === peekCaptionFace!.index ? { ...line, font: peekCaptionFace!.id } : line
        )
      : captions
    ).map((line) => (lead ? { ...line, start: line.start + lead, end: line.end + lead } : line))
  );

  async function setCaptions(next: TimedCaption[]) {
    await patch('the captions', { captions: next });
  }

  /*
   * What a block's settings do, named rather than written into the strip's
   * props, because the toolbar above it now does the same things. One function
   * per change, so the two can't drift into doing it differently.
   */
  async function muteShot(id: number, muted: boolean) {
    await autosave.run('the mute', () => updateSource({ id, muted }));
    await invalidateAll();
  }

  /** The framing of one shot: how it fills the frame, how far in, whether it drifts. */
  async function patchFraming(
    id: number,
    patch: { fit?: 'crop' | 'black' | 'blur' | null; zoom?: number; pan?: boolean }
  ) {
    await autosave.run('the framing', () => updateSource({ id, ...patch }));
    await invalidateAll();
  }

  async function fadeShot(id: number, fades: { fadeIn?: boolean; fadeOut?: boolean }) {
    await autosave.run('the fade', () => updateSource({ id, ...fades }));
    await invalidateAll();
  }

  /**
   * A cut becomes a dissolve, and back.
   *
   * The two shots trade handles rather than the clip trading length: the one
   * going out plays a little of the tail it was trimmed off, the one coming in
   * plays a little of its head and starts that much earlier, so where it ends
   * — and everything after it — does not move. A caption timed against the
   * picture stays timed against it, which a transition that shifted the clip
   * could not promise.
   */
  async function setDissolve(join: Join, on: boolean) {
    const patches = on ? dissolveJoin(join, advanced.xfadeSeconds) : cutJoin(join);
    await autosave.run(on ? 'the dissolve' : 'the cut', async () => {
      for (const patch of patches) await updateSource(patch);
    });
    await invalidateAll();
  }

  /**
   * A shot's own look.
   *
   * One effect rather than a list, because that is what the picker offers and
   * what a look is: this shot went through this. The column holds a list so
   * that stays open, and null gives the decision back to the clip — the same
   * arrangement `fit` has had all along.
   */
  async function setShotLook(id: number, effect: AppliedEffect | null) {
    await autosave.run('the shot’s look', () =>
      updateSource({ id, effects: effect ? [effect] : null })
    );
    await invalidateAll();
  }

  /**
   * Shows a caption's entrance, where it is, without moving the clip.
   *
   * An entrance only exists in motion, and parked after it every one of them
   * looks the same — the caption, arrived. So choosing one runs that caption's
   * own clock in the overlay for as long as the entrance lasts. Nothing plays
   * and the playhead doesn't move: the question was about the words.
   */
  let rehearsal = $state<{ index: number; token: number } | null>(null);

  function rehearseCaption(index: number) {
    rehearsal = { index, token: (rehearsal?.token ?? 0) + 1 };
  }

  async function patchCaption(index: number, patch: Partial<TimedCaption>) {
    if (!captions[index]) return;
    await setCaptions(captions.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  /*
   * Which wheel is open over the toolbar, if either.
   *
   * A colour is the one caption setting that can't be a button: it is a choice
   * among all of them, not on or off. So the button opens the same wheel the
   * Look panel uses, over the strip, and closes when the selection moves on —
   * a wheel left open over a different caption would be writing to something
   * nobody is looking at.
   */
  let captionWheel = $state<'color' | 'backdrop' | null>(null);

  $effect(() => {
    void selection.current;
    captionWheel = null;
  });

  /**
   * The effects dropped on the lane.
   *
   * The lane owns these and the Look panel owns the clip-wide one, so each
   * writes back only its own half — sending the whole list from either would
   * mean whichever was touched last silently cleared the other.
   */
  const placedEffects = $derived(
    (config.effects ?? []).filter((e) => e.start != null || e.end != null)
  );

  async function setPlacedEffects(placed: typeof placedEffects) {
    await patchConfig('the effects', {
      effects: [
        ...(config.effects ?? []).filter((e) => e.start == null && e.end == null),
        ...placed
      ],
      pictureEffect: null
    });
  }

  async function patchBed(
    id: number,
    { seekBy, ...changes }: { seekBy?: number; fadeIn?: boolean; fadeOut?: boolean; duck?: boolean }
  ) {
    // A head trim arrives as a shift, because only the row knows where the song
    // was already cued to.
    const track = seekBy ? data.audio.find((a) => a.id === id) : undefined;
    const cue = track ? { seek: Math.max(0, tidy((track.seek ?? 0) + seekBy!)) } : {};
    await autosave.run('the track', () => updateAudio({ id, ...changes, ...cue }));
    await invalidateAll();
  }

  /** Same, for an effect sitting on the timeline. */
  async function deletePlacedEffect(index: number) {
    const before = placedEffects;
    selection.clear();
    await setPlacedEffects(placedEffects.filter((_, i) => i !== index));
    toast.undoable('Effect removed', () => setPlacedEffects(before));
  }

  async function deleteCaption(index: number) {
    // The whole list, not the removed line: putting one back where it was is
    // the same operation as never having taken it out, and the array is small.
    const before = captions;
    await setCaptions(captions.filter((_, i) => i !== index));
    toast.undoable('Caption removed', () => setCaptions(before));
  }

  /*
   * The selected thing, for the tools row. The strip rings it; this is what
   * the verbs above act on — one place asking "what is chosen", rather than
   * each button working it out again.
   */
  const chosenShot = $derived(
    chosen?.kind === 'clip' ? (sources.find((s) => s.id === chosen.id) ?? null) : null
  );
  /** What the selected shot wears, if it wears anything of its own. */
  const chosenShotLook = $derived(shotEffects(chosenShot?.effects)?.[0] ?? null);
  const chosenBed = $derived(
    chosen?.kind === 'audio' ? (tracks.find((t) => t.id === chosen.id) ?? null) : null
  );
  const chosenCaption = $derived(
    chosen?.kind === 'caption' ? (captions[chosen.index] ?? null) : null
  );
  const chosenEffect = $derived(
    chosen?.kind === 'fx' ? (placedEffects[chosen.index] ?? null) : null
  );
</script>

<svelte:window
  onkeydown={(e) => {
    /*
     * Undo and redo, where every keyboard puts them.
     *
     * Behind the same guard the transport keys use, and for the stronger
     * reason: a text field has an undo of its own, and taking ⌘Z from it would
     * mean a typo costs you the whole caption instead of a letter.
     */
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;

    const el = e.target as HTMLElement | null;
    if (el?.isContentEditable) return;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

    e.preventDefault();
    void travel(e.shiftKey ? 'redo' : 'undo');
  }}
/>

<!--
  Removing a row is the same gesture wherever it appears — a source clip, a
  caption, an audio track — so it gets one shape. The label carries the meaning
  the glyph can't.
-->
<!--
  Saves this field's current text as the boilerplate every new clip starts with.
  Sits on the label rather than under the field so it reads as being about the
  field, not another thing to fill in.
-->

{#snippet saveAsDefault(field: 'tags' | 'description')}
  <button
    type="button"
    onclick={() => handleSaveDefault(field)}
    title="Save as the default for new clips"
    class="hover:text-link flex shrink-0 items-center gap-1 text-xs text-gray-500 transition-colors"
  >
    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
      />
    </svg>
    Save as default
  </button>
{/snippet}

<!--
  One button in the tools row, for a setting that is on or off.

  Two of them, because the fades have no icon in the set and never will — a
  wedge opening one way or the other says it in a way no glyph does — while
  everything else is a name in the library. Same size, same states, so the row
  reads as one row of buttons rather than two kinds.
-->

<!-- A switch in the transport row: on or off, pressed while watching.
     Two of them because some states are a shape nobody has drawn an icon for —
     a fade is two triangles — and the rest are in the icon set. Same size,
     same states, so the row reads as one row. -->
{#snippet toggle(label: string, on: boolean, act: () => void, d: string)}
  <button
    type="button"
    onclick={act}
    title={label}
    aria-label={label}
    aria-pressed={on}
    class="flex h-7 w-7 items-center justify-center rounded transition-colors {on
      ? 'bg-gray-50 text-gray-950'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-50'}"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path {d} fill="currentColor" />
    </svg>
  </button>
{/snippet}

{#snippet toggleIcon(label: string, on: boolean, act: () => void, src: IconSource)}
  <button
    type="button"
    onclick={act}
    title={label}
    aria-label={label}
    aria-pressed={on}
    class="flex h-7 w-7 items-center justify-center rounded transition-colors {on
      ? 'bg-gray-50 text-gray-950'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-50'}"
  >
    <Icon {src} size="16" solid />
  </button>
{/snippet}

{#snippet linkAction(onclick: () => void, label: string, path: string)}
  <button
    type="button"
    {onclick}
    title={label}
    aria-label={label}
    class="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50"
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={path} />
    </svg>
  </button>
{/snippet}

<!--
  A row action.

  Three bordered, filled boxes on every row turned a list of media into a strip
  of toolbars — the eye landed on the chrome before the filenames, which are the
  reason the list exists. So no box at rest: an icon big enough to read, dark
  enough to sit back, and a target that fills in the moment you are over it.

  Not hover-only, though. This list is meant to work on a phone, and a control
  that waits for a pointer can't be found on the screen where that matters most.
-->
{#snippet rowButton(
  onclick: () => void,
  label: string,
  path: string,
  tone: 'normal' | 'primary' | 'danger' = 'normal',
  busy = false,
  disabled = false
)}
  <button
    {onclick}
    {disabled}
    aria-label={label}
    title={label}
    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 {tone ===
    'danger'
      ? 'text-gray-500 hover:bg-red-500/15 hover:text-red-300'
      : tone === 'primary'
        ? 'text-link light:hover:text-violet-800 hover:bg-violet-500/20 hover:text-violet-200'
        : 'hover:bg-raise/10 text-gray-500 hover:text-gray-200'}"
  >
    <svg
      class="h-[18px] w-[18px] {busy ? 'animate-spin' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={path} />
    </svg>
  </button>
{/snippet}

<!-- The picture in the middle, the clip's menu beside it.

     It used to be the other way round — a column of cards taking two thirds of
     the page and the picture squeezed into a fixed slice of what was left, so
     the one thing being made was the smallest thing on screen. Now the menu is
     a column and the picture has everything else: it grows with the window and
     shrinks as the timeline is dragged taller. -->
{#snippet selectionAside()}
  <!-- What you have selected, and everything that can be said to it.

       Its own column rather than a section of the rail panel. It used to
       take that panel over, which meant remembering what had been there,
       whether the panel was open at all, and putting both back when you
       let go — three pieces of state whose only job was to hide the
       borrowing. On the right of the picture rather than the left, so the
       two columns sit either side of it and the video ends up centred
       instead of pushed against the edge.

       The strip still does the moving and the trimming; this is the rest. -->
  <div class="flex items-center gap-2 border-b px-4 py-3 text-gray-50 {selectionTint}">
    <Icon src={selectionIcon} size="16" solid class="shrink-0 opacity-70" />
    <span class="min-w-0 flex-1 truncate text-sm font-medium">{selectionName}</span>
    <button
      type="button"
      onclick={() => selection.clear()}
      title="Close"
      aria-label="Close"
      class="hover:bg-raise/10 shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
    >
      <Icon src={XMark} size="16" />
    </button>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    {#if chosen}
      {#if chosenShot}
        {@const shot = chosenShot}
        <TrackDialog
          inline
          kind="clip"
          label={mediaById.get(shot.mediaId)?.filename ?? 'Shot'}
          muted={Boolean(shot.muted)}
          still={Boolean(mediaById.get(shot.mediaId)?.mimeType?.startsWith('image/'))}
          fit={(shot.fit as 'crop' | 'black' | 'blur' | null) ?? null}
          zoom={shot.zoom ?? 1}
          pan={Boolean(shot.pan)}
          fadeIn={Boolean(shot.fadeIn)}
          fadeOut={Boolean(shot.fadeOut)}
          onmute={(muted) => muteShot(shot.id, muted)}
          onfit={(fit) => patchFraming(shot.id, { fit })}
          onframing={(patch) => patchFraming(shot.id, patch)}
          onfade={(patch) => fadeShot(shot.id, patch)}
          onremove={() => dropSource(shot.id)}
          onclose={() => selection.clear()}
        >
          {#snippet extra()}
            <!-- Its own look, with the rest of what it is — rather than
                     in the Effects panel, which is about the clip. Above
                     the way to remove it, which belongs last. -->
            <span class={labelClass}>Its own look</span>
            <EffectPicker
              family="picture"
              value={chosenShotLook}
              inherited={clipWideEffect(config)}
              canInherit
              clipId={selected.id}
              swatches={brandColors}
              onchange={(picked) => setShotLook(shot.id, picked)}
            />
          {/snippet}
        </TrackDialog>
      {:else if chosenBed}
        {@const bed = chosenBed}
        <TrackDialog
          inline
          kind="audio"
          label={bed.label}
          fadeIn={bed.fadeIn}
          fadeOut={bed.fadeOut}
          duck={bed.duck}
          onaudio={(patch) => patchBed(bed.id, patch)}
          onremove={() => dropTrack(bed.id)}
          onclose={() => selection.clear()}
        />
      {:else if chosenEffect && chosen.kind === 'fx'}
        {@const index = chosen.index}
        <FxDialog
          inline
          effect={chosenEffect}
          {index}
          swatches={brandColors}
          clipId={selected.id}
          onchange={(patch) =>
            setPlacedEffects(
              placedEffects.map((fx, i) => (i === index ? { ...fx, ...patch } : fx))
            )}
          onremove={() => deletePlacedEffect(index)}
          onclose={() => selection.clear()}
        />
      {:else if chosenCaption && chosen.kind === 'caption'}
        {@const index = chosen.index}
        <CaptionDialog
          inline
          caption={chosenCaption}
          {index}
          anchors={captionAnchors(advanced)}
          anchor={chosenCaption.anchor ?? 'bottom'}
          swatches={brandColors}
          inheritedColor={accent}
          inheritedBackdrop={config.captionBackdropColor ?? null}
          inheritedBorder={config.captionBorderColor ?? '#000000'}
          inheritedBorderWidth={config.captionBorderWidth ?? 4}
          baseSize={Math.round(look.frame.width / CAPTION_SIZE_DIVISOR)}
          inheritedEffect={config.captionEffect ?? null}
          onpeekfont={(id) => (peekCaptionFace = id === undefined ? null : { index, id })}
          onchange={(patch) => patchCaption(index, patch)}
          onpickeffect={() => rehearseCaption(index)}
          onremove={() => deleteCaption(index)}
          onclose={() => selection.clear()}
        />
      {/if}
    {/if}
  </div>
{/snippet}

<EditorPreview
  editorClass={panelOpen ? 'lg:w-[26rem] lg:flex-none xl:w-[28rem]' : 'lg:w-[4.5rem] lg:flex-none'}
  previewClass="lg:flex-1"
  aside={chosen ? selectionAside : undefined}
  padEditor={false}
  editorScroll={false}
  padPreview
>
  {#snippet editor()}
    <!-- Zero height, so the first card below starts at the top of the column
         and lines up with the video in the pane beside it. The status floats
         over the corner instead of holding a row open for the nine tenths of
         the time it has nothing to report. -->

    {#if !data.renderingAvailable}
      <div class="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm">
        <p class="font-medium text-amber-300">Rendering is unavailable</p>
        <p class="mt-1 text-amber-200/70">
          ffmpeg isn't installed on the server, so clips can't be rendered here.
        </p>
      </div>
    {/if}

    <!-- The clip's own menu: which part of it you are working on. A rail
         rather than a stack of cards, so the panel beside it holds one thing
         at a time and the picture keeps the rest of the page. -->
    <div class="flex h-full min-h-0">
      <!-- Scrolls on its own: the pane it sits in is clipped, and on a short
           screen the last section was simply out of reach. -->
      <nav
        class="bg-rail flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-800 p-2"
      >
        {#each railSections as item (item.id)}
          <button
            type="button"
            onclick={() => openSection(item.id)}
            aria-current={section === item.id && panelOpen ? 'page' : undefined}
            aria-expanded={section === item.id && panelOpen}
            title={section === item.id && panelOpen ? `Hide ${item.label}` : item.label}
            class="flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors {section ===
              item.id && panelOpen
              ? 'bg-panel text-gray-50'
              : 'hover:bg-panel/60 text-gray-500 hover:text-gray-50'}"
          >
            <Icon src={item.icon} size="18" solid />
            {item.label}
          </button>
        {/each}

        <!-- Removing the clip, and the drawer of numbers: pushed to the floor
             under a line, in the rail but not in the row above it. Neither is
             a part of a clip, which is what that row lists.

             Delete was the last thing in Send, where it sat under the things
             that publish — one slip away from the button you came for. Down
             here it is nowhere near anything you reach for. -->
        <button
          type="button"
          onclick={() => (deleteConfirmOpen = true)}
          title="Delete this clip"
          class="mt-auto flex w-14 flex-col items-center gap-1 rounded-lg border-t border-gray-800 px-1 pt-3 pb-2 text-[10px] text-gray-500 transition-colors hover:bg-red-600 hover:text-white"
        >
          <svg
            class="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
          Delete
        </button>

        <button
          type="button"
          onclick={() => openSection(ADVANCED_SECTION.id)}
          aria-current={section === ADVANCED_SECTION.id && panelOpen ? 'page' : undefined}
          aria-expanded={section === ADVANCED_SECTION.id && panelOpen}
          title={changedAdvanced
            ? `Advanced — ${changedAdvanced} changed from default`
            : 'Advanced'}
          class="flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors {section ===
            ADVANCED_SECTION.id && panelOpen
            ? 'bg-panel text-gray-50'
            : 'hover:bg-panel/60 text-gray-500 hover:text-gray-50'}"
        >
          <span class="relative">
            <Icon src={ADVANCED_SECTION.icon} size="18" solid />
            {#if changedAdvanced}
              <span class="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-violet-400"
              ></span>
            {/if}
          </span>
          {ADVANCED_SECTION.label}
        </button>
      </nav>
      {#if panelOpen}
        <div class="flex min-w-0 flex-1 flex-col overflow-y-auto p-[clamp(1rem,4vw,1.5rem)]">
          <div class="flex flex-1 flex-col space-y-6">
            <!-- Post details. No heading: the Name field is the clip's title, so a
           label above it would just say the same thing twice. -->
            {#if section === 'post'}
              <div class="grid [grid-template-columns:minmax(0,1fr)] gap-4">
                <div>
                  <label class={labelClass} for="clip-name">Name</label>
                  <input
                    id="clip-name"
                    class={fieldClass}
                    value={selected.name}
                    onblur={(e) => patch('the name', { name: e.currentTarget.value })}
                  />
                  <!-- Both true and both worth saying: it is how you find this
                       clip again, and it is what the file is called when it
                       goes out. Nobody guesses the second one. -->
                  <p class="mt-1 text-xs text-gray-500">
                    How you find the clip here, and what the finished file is called.
                  </p>
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between gap-2">
                    <span class="text-sm text-gray-400">Tags</span>
                    {@render saveAsDefault('tags')}
                  </div>
                  <!-- Keyed on the clip so navigating between clips reseeds it,
                 rather than an effect syncing the prop into state. -->
                  {#key selected.id}
                    <TagInput
                      initial={data.tags}
                      suggestions={data.allTags}
                      placeholder="indie rock, new music"
                      onchange={(names) => {
                        tagNames = names;
                        patch('the tags', { tags: names });
                      }}
                    />
                  {/key}
                  <p class="mt-1 text-xs text-gray-500">
                    Go out as hashtags at the end of the caption.
                  </p>
                </div>
                <div>
                  <span class={labelClass}>Description</span>
                  <!-- The same editor as everywhere else, with its marks off:
                       this is posted as plain text, so a `<b>` would be typed
                       out in the caption rather than read as bold. What it
                       keeps is the emoji picker, the field's own "save as
                       default", and the meter — which used to be three things
                       assembled here by hand. -->
                  {#key selected.id}
                    <!-- Taller than the shared default: the caption is the
                         longest thing anyone types in this editor and the one
                         they rewrite most, and ten rems meant scrolling a
                         paragraph inside a box with room for three lines. -->
                    <RichTextEditor
                      content={selected.description ?? ''}
                      marks={false}
                      minHeight="min-h-[18rem]"
                      placeholder="Keywords first. This becomes the post caption."
                      onUpdate={(value: string) => (captionText = value)}
                      onblur={(value: string) => patch('the description', { description: value })}
                      meter={{
                        limit: 100,
                        hard: 350,
                        split: true,
                        hint: 'The first 100 characters or so show before “more”.',
                        softHint: 'Past the fold. The rest is behind “more”.',
                        hardHint: 'Long for a caption. People stop reading.'
                      }}
                    >
                      {#snippet actions()}
                        {@render saveAsDefault('description')}
                      {/snippet}
                    </RichTextEditor>
                  {/key}
                </div>

                <!-- The way on.

                     The rail is the job in order, and the first two steps are
                     naming the clip and getting footage into it — but nothing
                     on this panel says the second one exists. A new clip opens
                     here, with the fields filled in and no sign that the next
                     thing is a tab away. One button, and only while there is
                     nothing in the pool: once there is footage, the step has
                     been taken and the button is a leftover. -->
                {#if sources.length === 0 && pool.length === 0}
                  <button
                    type="button"
                    onclick={() => {
                      section = 'media';
                      panelOpen = true;
                    }}
                    class="flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                  >
                    Add media
                    <span aria-hidden="true">→</span>
                  </button>
                {/if}
              </div>
            {/if}

            <!-- Branding, on its own rather than buried under Look.

           It is a look decision — which mark the clip wears and where — but
           it is the one you make once and then leave alone, while the rest
           of Look is what you fiddle with. Sharing a card put the settled
           thing underneath the unsettled one.

           Not folded into the first card either: that one is the post — the
           name, the tags, the caption that gets typed into TikTok — and this
           is the render. -->

            <!-- Captions -->

            <!-- Music -->
            <!-- Look -->
            <!-- One card, because they are one thing: what the clip is made of.
           Two cards said footage and music were different kinds of
           material, when the only difference is which lane they land in
           and both are dragged onto the same timeline. -->
            <!-- The pool: what this clip has to work with.

           Not the timeline written out a second time, which is what this list
           used to be — every row was a placement, so a file could only be here
           by already being down there, and using a shot twice meant picking it
           twice. Adding and placing are two things now, and this is the first
           of them. -->
            <!-- No title: the two buttons are the heading. "MEDIA" over a grid of
           media said what the grid was already saying, and the way to fill it
           was at the bottom, past everything it had already been filled with. -->
            {#if section === 'media'}
              <div class="mb-3">
                <MediaAdd
                  accept="{ACCEPT_VIDEO},{ACCEPT_IMAGE},{ACCEPT_AUDIO}"
                  onadd={handleAddMedia}
                  onbrowse={() => (mediaPickerOpen = true)}
                  onphone={() => (phoneUploadOpen = true)}
                  hint="or drop footage, stills and music here"
                />
              </div>

              {#if pool.length === 0}
                <p class="text-sm text-gray-500">
                  Nothing yet. Whatever you add lands on the timeline in order.
                </p>
              {:else}
                <!-- Rows, not tiles.

               Tiles were right while this panel was the width of the page: the
               picture is what you recognise a take by, and three fit across.
               In a rail two fit, a music file became a tile of empty grey with
               a note in the middle, and the filename — the only thing telling
               two takes from the same shoot apart — was cut off at a dozen
               characters. A row gives the name the width and keeps the picture
               big enough to recognise. -->
                <div class="flex flex-col gap-1">
                  {#each pool as entry (entry.id)}
                    {@const item = mediaById.get(entry.mediaId)}
                    {@const isAudio = Boolean(item?.mimeType?.startsWith('audio/'))}
                    {@const isStill = Boolean(item?.mimeType?.startsWith('image/'))}
                    {@const uses = isAudio
                      ? tracks.filter((t) => t.mediaId === entry.mediaId).length
                      : sources.filter((source) => source.mediaId === entry.mediaId).length}
                    <div
                      class="flex items-center gap-2.5 rounded-lg bg-gray-800/50 p-1.5 transition-colors hover:bg-gray-800"
                    >
                      <div class="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-gray-950">
                        {#if item?.thumbnailUrl || (isStill && item?.url)}
                          <img
                            src={item.thumbnailUrl ?? item.url}
                            alt=""
                            class="h-full w-full object-cover"
                          />
                        {:else}
                          <div class="flex h-full w-full items-center justify-center">
                            <Icon
                              src={isAudio ? MusicalNote : Film}
                              size="18"
                              class="text-gray-500"
                            />
                          </div>
                        {/if}
                      </div>

                      <div class="min-w-0 flex-1">
                        <p class="truncate text-xs text-gray-50" title={item?.filename}>
                          {item?.filename ?? 'Missing file'}
                        </p>
                        <p class="flex items-center gap-1.5 text-[10px] text-gray-500">
                          <!-- A still has no running time of its own; how long it is
                         held is a property of where it sits on the strip. -->
                          <span>{isStill ? 'Still' : formatDuration(item?.durationMs)}</span>
                          <span class="text-gray-700">·</span>
                          <!-- How many times it is on the timeline: the one thing
                         this list can say that the strip can't, and "not
                         placed" is a real state. -->
                          <span class={uses === 0 ? 'text-gray-500' : 'text-gray-400'}>
                            {uses === 0 ? 'not placed' : uses === 1 ? 'placed' : `${uses}×`}
                          </span>
                        </p>
                      </div>

                      <div class="flex shrink-0 items-center gap-0.5">
                        {#if !isAudio}
                          {@render rowButton(
                            () => turnMedia(entry.mediaId),
                            "Turn a quarter. Rewrites the footage, everywhere it's used",
                            'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
                            'normal',
                            turningId === entry.mediaId,
                            turningId !== null
                          )}
                        {/if}
                        {@render rowButton(
                          () => placeInTimeline(entry.mediaId, isAudio),
                          `Put ${item?.filename ?? 'this'} on the timeline`,
                          'M12 4v11m0 0l-3.5-3.5M12 15l3.5-3.5M5 20h14',
                          uses === 0 ? 'primary' : 'normal'
                        )}
                        {@render rowButton(
                          () => dropFromPool(entry.mediaId, item?.filename ?? 'the file', uses),
                          'Remove from this clip',
                          'M6 18L18 6M6 6l12 12',
                          'danger'
                        )}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {/if}

            <!-- No title. Four pictures of the clip with its name under each says
           "look" more plainly than the word does, and the word cost a row. -->
            {#if section === 'look'}
              {#if chosenShot}
                <!-- The selected shot's own look, before the clip's presets.
                     Effects belong to the thing they are done to: this one
                     travels with the shot when it moves or is trimmed, where
                     an effect on the clip's lane stays where it was put. It
                     sits at the top because it is about what you have in your
                     hand; the presets below are about the clip. -->
                <div class="mb-5 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
                  <span class={labelClass}>
                    This shot · {mediaById.get(chosenShot.mediaId)?.filename ?? 'Selected'}
                  </span>
                  <EffectPicker
                    family="picture"
                    value={chosenShotLook}
                    inherited={clipWideEffect(config)}
                    canInherit
                    clipId={selected.id}
                    swatches={brandColors}
                    onchange={(picked) => setShotLook(chosenShot.id, picked)}
                  />
                </div>
              {/if}

              <!-- The templates and nothing else. Each one is a still of this clip's
             own footage with that grade on it, which is the whole decision for
             most clips and the only part of it worth showing unprompted.

             The frame moved in behind Customise with the rest. It is genuinely
             not a look — it depends on what you shot, not the mood you want —
             but it is also 9:16 for every clip this studio exists to make, so
             standing at the front it was a question nobody needed to answer. -->
              <!-- Two presets per row even on the narrowest phone: they're compared
             against each other, and one per row makes that a scroll. -->
              <span class={groupTitleClass}>Presets</span>
              <div
                class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,7.5rem),1fr))] gap-3"
              >
                {#each CLIP_PRESETS as preset (preset.id)}
                  <!-- A pressed button rather than a chosen one: the tile you are on
                 is the one you press to come off it, which is why there is no
                 Clean tile any more — a project with nothing applied is what
                 Clean used to set. -->
                  <button
                    type="button"
                    onclick={() => applyPreset(preset.id)}
                    aria-pressed={activePreset === preset.id}
                    title={activePreset === preset.id
                      ? `${preset.description}\n\nPress again to turn it off.`
                      : preset.description}
                    class="group overflow-hidden rounded-lg border text-left transition-colors {activePreset ===
                    preset.id
                      ? 'border-violet-500'
                      : 'border-gray-700 hover:border-gray-500'}"
                  >
                    <div class="aspect-[4/3] overflow-hidden bg-gray-950">
                      <!-- Pooled footage counts, not just placed: the swatch takes a
                     frame from the first shot if there is one and the first file
                     in the pool otherwise, so a clip with media in it can show
                     its looks before anything is arranged. -->
                      {#if sources.length || pool.length}
                        <img
                          src="/admin/clips/{selected.id}/preset/{preset.id}"
                          alt=""
                          loading="lazy"
                          class="h-full w-full object-cover"
                        />
                      {:else}
                        <div
                          class="flex h-full w-full items-center justify-center px-2 text-center"
                        >
                          <span class="text-[10px] leading-tight text-gray-500">
                            Add footage to preview
                          </span>
                        </div>
                      {/if}
                    </div>
                    <div class="p-2">
                      <p
                        class="text-xs font-medium {activePreset === preset.id
                          ? 'text-link-strong'
                          : 'text-gray-300 group-hover:text-gray-50'}"
                      >
                        {preset.label}
                      </p>
                      <p class="mt-0.5 line-clamp-2 text-[10px] leading-snug text-gray-500">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                {/each}

                <!-- The dials, as one more tile.

               A cog in the card's corner was a control in a different language
               from the four things beside it, and it is the same kind of choice
               — one more way for the clip to look, just not one anybody made a
               picture of. Last, because it is where you go when none of the
               four did it. -->
                <button
                  type="button"
                  onclick={() => (showCustomise = !showCustomise)}
                  aria-expanded={showCustomise}
                  class="group overflow-hidden rounded-lg border text-left transition-colors {showCustomise ||
                  !activePreset
                    ? 'border-violet-500'
                    : 'border-gray-700 hover:border-gray-500'}"
                >
                  <div class="flex aspect-[4/3] items-center justify-center bg-gray-950">
                    <svg
                      class="h-7 w-7 {showCustomise ? 'text-link-strong' : 'text-gray-500'}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div class="p-2">
                    <p
                      class="text-xs font-medium {showCustomise || !activePreset
                        ? 'text-link-strong'
                        : 'text-gray-300 group-hover:text-gray-50'}"
                    >
                      {activePreset ? 'Customise' : 'Custom'}
                    </p>
                    <p class="mt-0.5 line-clamp-2 text-[10px] leading-snug text-gray-500">
                      Branding, framing and every dial behind the presets
                    </p>
                  </div>
                </button>
              </div>

              <!-- Branding: three switches that each carry the mark they will draw.

             Titled, like the presets above it — two rows of controls with no
             names on them read as one undifferentiated block, and the heading
             is what says where one ends.

             Two targets per chip, which is the whole idea: the picture is what
             gets drawn, so pressing it asks which picture; the word is whether
             it gets drawn at all, so pressing it toggles. One dropdown between
             them, because there is one graphic — three pickers would imply you
             could give the watermark a different mark from the intro. -->

              {#if showCustomise}
                <div class="mt-4 space-y-4">
                  <!-- Said once, at the top, because it is the thing the panel stopped
                 being able to say for itself.

                 Everything in here is one decision about the whole clip. That
                 was obvious when it was the only place effects existed; it is
                 not obvious now that the strip has a lane for the ones that
                 happen partway through, and a panel full of switches looks much
                 the same either way. One sentence is cheaper than working it
                 out from which controls are where. -->
                  <p class="text-xs text-gray-500">
                    These global settings affect the entire timeline.
                  </p>
                  <!-- Branding lives here now.

                 It was a card of its own, above the presets, holding a graphic
                 picker and three checkboxes that are right by default and
                 touched about as often as the dials below them. A card is a
                 claim on the column; this is a row inside the one place that is
                 already about how the clip looks. -->
                  <!-- Branding is not in here any more. Which graphic, and whether
                 each of the three stages runs, are both set on the row under the
                 presets — the graphic by pressing the picture on any chip. Two
                 places to choose one mark is how they drift. -->

                  <!-- The frame comes before the look: it depends on what you shot, not
               on the mood you want, and it's the one choice here with a real
               render cost. Presets used to set it, so changing look silently
               re-framed the clip. -->

                  <!-- The footage effect first, because it is the loudest thing on
                 the picture and everything under it is a detail by comparison.
                 The switches follow, in groups that each name a subject. -->
                  <div class="mt-5 border-t border-gray-800 pt-4">
                    <span class={labelClass}>
                      {chosenShot ? 'Every shot' : 'Footage effect'}
                    </span>
                    <EffectPicker
                      family="picture"
                      value={clipWideEffect(config)}
                      clipId={selected.id}
                      swatches={brandColors}
                      onchange={(chosen) =>
                        patchConfig('the look', {
                          /*
                           * Replaces the clip-wide entry and leaves any placed ones
                           * alone. This control speaks for the whole clip, so it has
                           * no business clearing a tear somebody dragged onto the
                           * chorus.
                           */
                          effects: [
                            ...(config.effects ?? []).filter(
                              (e) => e.start != null || e.end != null
                            ),
                            ...(chosen ? [chosen] : [])
                          ],
                          pictureEffect: null
                        })}
                    />
                  </div>

                  <div
                    class="mt-4 grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-4"
                  >
                    {#each LOOK_GROUPS as group (group.label)}
                      <div>
                        <span class={groupTitleClass}>{group.label}</span>
                        <div class="space-y-1.5">
                          {#each group.options as option (option.key)}
                            <label
                              class="flex items-center gap-2 text-sm text-gray-300"
                              title={option.hint}
                            >
                              <input
                                type="checkbox"
                                checked={config[option.key] as boolean}
                                onchange={(e) =>
                                  patchConfig('the look', {
                                    [option.key]: e.currentTarget.checked
                                  } as never)}
                                class="rounded border-gray-600 bg-gray-700 text-violet-500"
                              />
                              {option.label}
                            </label>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>

                  <!-- Captions: everything that decides what a caption means by Auto.

                 These were two tick boxes among the footage switches and a
                 picker a screen below them — three places for one subject, and
                 none of them saying what they had in common. A heading can say
                 it where a tick box in a grid of nine cannot: none of this
                 decides how a caption looks, because every one of them can be
                 overruled from the caption's own block. What it decides is what
                 a caption falls back to when it hasn't been asked. -->
                  <div class="mt-5 border-t border-gray-800 pt-4">
                    <span class={labelClass}>Captions</span>
                    <p class="mb-3 text-xs text-gray-500">
                      What a caption does when it hasn't been given its own. Any caption can
                      overrule all of this from its block.
                    </p>

                    <!-- Colours, shown as colours.

                   These were two tick boxes — "brand colour" and "backdrop" —
                   and a tick box cannot show you what it does. You had to
                   already know that one tinted the words and the other put a
                   panel behind them, and that the panel was always black
                   whatever the rest of the clip was doing. The same wheel a
                   caption carries on its own block says both in the only way
                   that needs no explaining: here is the colour. -->
                    <div class="mb-4 flex flex-wrap items-start gap-x-8 gap-y-3">
                      <ColorWheel
                        label="Words"
                        value={captionColor({}, config, accent)}
                        swatches={brandColors}
                        onkeep={keep}
                        onchange={(c) =>
                          patchConfig('the look', { colorizeCaption: true, logoColor: c })}
                        actions={[
                          {
                            label: 'White',
                            onclick: () => patchConfig('the look', { colorizeCaption: false })
                          }
                        ]}
                      />

                      <ColorWheel
                        label="Behind them"
                        value={captionBackdrop({}, config) ?? 'none'}
                        swatches={brandColors}
                        onkeep={keep}
                        onchange={(c) =>
                          patchConfig('the look', {
                            captionBackground: true,
                            captionBackdropColor: c
                          })}
                        actions={[
                          {
                            label: 'None',
                            onclick: () => patchConfig('the look', { captionBackground: false })
                          }
                        ]}
                      />
                    </div>

                    <EffectPicker
                      value={config.captionEffect}
                      swatches={brandColors}
                      onchange={(captionEffect) => patchConfig('the look', { captionEffect })}
                    />
                  </div>
                </div>
              {/if}
            {/if}

            {#if section === 'advanced'}
              <AdvancedPanel
                {advanced}
                {savedAdvanced}
                ondraft={(key, value) => (advancedDraft = { ...advancedDraft, [key]: value })}
                onfield={async (key, value) => {
                  const ok = await patchAdvanced({ [key]: value } as never);
                  if (ok) {
                    const { [key]: _saved, ...rest } = advancedDraft;
                    advancedDraft = rest;
                  }
                  return Boolean(ok);
                }}
                onreset={resetAdvanced}
                onpreset={(value) => patchAdvanced({ preset: value as never })}
              />
            {/if}

            {#if section === 'frame'}
              <!-- What the picture is, and what is drawn onto it. The shape and the
               fill decide what a shot has to fit; the branding is laid over the
               result. Both are decisions about the frame rather than about the
               look, and both were buried under a tile called Customise. -->
              <!-- First, not last.

                   It sat at the foot of this panel under Aspect, Fill and
                   Speed, which made the one thing in here anybody goes looking
                   for by name the one thing they had to scroll past three
                   settings to find. The mark on the clip is the loudest thing
                   the frame carries, so it leads.

                   Not a toolbar switch: that row is about the block you have
                   selected — its fades, its sound — and these are three facts
                   about the whole clip, set once rather than pressed while you
                   watch. -->
              <div class="mb-5">
                <span class={groupTitleClass}>Branding</span>
                <!-- One to a row.

                     Three across a rail this narrow left each thumbnail nine
                     pixels of width, which is not a picture of anything, and
                     the third chip wrapped anyway the moment they had a
                     divider. Stacked, each gets a thumbnail you can recognise
                     the mark in, and the three read as a list of decisions
                     rather than a row of tabs. -->
                <div class="flex flex-col gap-1.5">
                  {#each BRANDING_OPTIONS as option (option.key)}
                    {@const on = Boolean(config[option.key])}
                    {@const stage = option.key as BrandStage}
                    {@const mark = stageGraphic(stage)}
                    <div
                      class="flex items-stretch overflow-hidden rounded-lg border transition-colors {on
                        ? 'border-violet-500/60 bg-violet-600/12'
                        : 'border-gray-700'}"
                    >
                      <!-- Two halves, and they have to look like two.

                           The left one opens everything about the stage: which
                           graphic it draws, and the handful of numbers that say
                           how. The right one turns the stage on and off. They
                           were one unbroken chip, so nothing said the picture
                           did something different from the word next to it, and
                           the settings behind it went unfound. A rule down the
                           middle, a caret under the thumbnail and a hover each
                           of their own: the shape says there are two things
                           here without a line of explanation. -->
                      <PopoverPanel
                        title={mark
                          ? `Drawn with ${mark.filename}. Press for its settings`
                          : 'No graphic set. Press to choose one'}
                        panelClass="w-72"
                        triggerClass="flex w-24 shrink-0 items-center justify-center gap-1 border-r {on
                          ? 'border-violet-400/50'
                          : 'border-gray-700'} bg-black/30 px-2 py-1.5 transition-colors hover:bg-black/60"
                      >
                        {#snippet trigger({ open })}
                          {#if mark}
                            <img
                              src={mark.thumbnailUrl || mark.url}
                              alt=""
                              class="h-8 min-w-0 flex-1 object-contain"
                            />
                          {:else}
                            <span class="min-w-0 flex-1 text-center text-[10px] text-gray-500"
                              >?</span
                            >
                          {/if}
                          <!-- The mark every disclosure wears, turned when it
                               is out. -->
                          <svg
                            class="h-2.5 w-2.5 shrink-0 text-gray-400 transition-transform {open
                              ? 'rotate-180'
                              : ''}"
                            viewBox="0 0 10 10"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M1 3.5 5 7.5 9 3.5Z" />
                          </svg>
                        {/snippet}

                        <span class={groupTitleClass}>{option.label} graphic</span>
                        <ul role="listbox" class="-mx-1 max-h-56 overflow-y-auto px-1">
                          {#each graphicOptions as choice (choice.value)}
                            {@const chosen =
                              choice.value === String(stageGraphicId(config, stage) ?? '')}
                            <li>
                              <button
                                type="button"
                                role="option"
                                aria-selected={chosen}
                                onclick={() =>
                                  patchConfig('the branding', {
                                    [`${stage}GraphicMediaId`]:
                                      choice.value === '' ? null : Number(choice.value)
                                  } as never)}
                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors {chosen
                                  ? 'light:text-violet-800 bg-violet-600/20 text-violet-200'
                                  : 'text-gray-300 hover:bg-gray-800 hover:text-gray-50'}"
                              >
                                <!-- Site default and Random have no picture of
                                     their own, so they keep the space to stay
                                     in line with the rest. -->
                                {#if 'image' in choice}
                                  <img
                                    src={choice.image}
                                    alt=""
                                    class="h-6 w-8 shrink-0 rounded bg-gray-950 object-contain"
                                  />
                                {:else}
                                  <span class="h-6 w-8 shrink-0"></span>
                                {/if}
                                <span class="min-w-0 flex-1 truncate">{choice.label}</span>
                              </button>
                            </li>
                          {/each}
                        </ul>

                        <!-- And what the stage does with it. Dimmed while the
                             stage is off: the numbers still describe it, but
                             nothing is drawing them yet, and that is worth
                             saying without taking them away. -->
                        <div class="mt-3 {on ? '' : 'opacity-50'}">
                          <div class="divide-y divide-gray-800/70 border-t border-gray-800/70">
                            {#each BRANDING_FIELDS[stage] as field (field.key)}
                              <RenderDial
                                {field}
                                saved={savedAdvanced[field.key] as number}
                                changed={advanced[field.key] !== DEFAULT_ADVANCED_CONFIG[field.key]}
                                oninput={(value) =>
                                  (advancedDraft = { ...advancedDraft, [field.key]: value })}
                                onsave={async (value) => {
                                  const ok = await patchAdvanced({ [field.key]: value } as never);
                                  if (ok) {
                                    const { [field.key]: _saved, ...rest } = advancedDraft;
                                    advancedDraft = rest;
                                  }
                                  return Boolean(ok);
                                }}
                              />
                            {/each}

                            {#if stage === 'watermark'}
                              <!-- Which corner, which is the whole of where it
                                   goes. How far in from that corner is a
                                   detail, and lives with the details. -->
                              <div class="flex items-center gap-3 py-2">
                                <span class="min-w-0 flex-1 text-sm text-gray-400">Corner</span>
                                <div
                                  class="flex shrink-0 items-stretch rounded-lg border border-gray-700 bg-gray-950/60 p-0.5 text-xs"
                                  role="group"
                                  aria-label="Which side the watermark sits on"
                                >
                                  {#each [{ side: 'left', label: 'Left' }, { side: 'right', label: 'Right' }] as choice (choice.side)}
                                    {@const picked =
                                      (advanced.watermarkAlign ?? 'left') === choice.side}
                                    <button
                                      type="button"
                                      aria-pressed={picked}
                                      onclick={() =>
                                        patchAdvanced({
                                          watermarkAlign: choice.side as 'left' | 'right'
                                        })}
                                      class="rounded-md px-2 py-1 transition-colors {picked
                                        ? 'bg-gray-700 text-gray-50'
                                        : 'text-gray-500 hover:text-gray-300'}"
                                    >
                                      {choice.label}
                                    </button>
                                  {/each}
                                </div>
                              </div>
                            {/if}

                            <!-- What is behind the mark, asked only when there
                                 is anything behind it.

                                 A mark that lies entirely over the footage has
                                 no background: the footage is the background.
                                 So the row appears with the run-up or the time
                                 after, and the answer is a colour — or no
                                 colour, which can only mean the picture you
                                 were already watching stays where it is. That
                                 was a switch and a colour, which is the same
                                 question asked twice. -->
                            {#if outsideFootage(stage) > 0}
                              {@const held =
                                stage === 'intro'
                                  ? Boolean(config.introHold)
                                  : Boolean(config.outroHold)}
                              {@const frame = stage === 'intro' ? 'first' : 'last'}
                              <div class="flex items-center gap-3 py-2">
                                <span class="min-w-0 flex-1 text-sm text-gray-400">Background</span>
                                <ColorWheel
                                  label=""
                                  compact
                                  title="What sits behind the {option.label.toLowerCase()}"
                                  value={held ? '' : advanced.cardBackground}
                                  swatches={brandColors}
                                  onkeep={keep}
                                  actions={[
                                    {
                                      label: `Hold the ${frame} frame`,
                                      onclick: () =>
                                        patchConfig('the branding', {
                                          [stage === 'intro' ? 'introHold' : 'outroHold']: true
                                        } as never)
                                    }
                                  ]}
                                  onchange={(c) => {
                                    patchAdvanced({ cardBackground: c });
                                    // Choosing a colour is choosing a colour.
                                    if (held) {
                                      patchConfig('the branding', {
                                        [stage === 'intro' ? 'introHold' : 'outroHold']: false
                                      } as never);
                                    }
                                  }}
                                >
                                  {#snippet trigger({ value, none })}
                                    <!-- A colour is a swatch and its hex; no
                                         colour is a sentence. An empty swatch
                                         beside the words was a hole in the row
                                         standing in for a thing that isn't
                                         there, and the hex's monospace made a
                                         phrase look like a value. -->
                                    {#if none}
                                      <span class="text-xs text-gray-300">The {frame} frame</span>
                                    {:else}
                                      <span
                                        class="h-4 w-4 shrink-0 rounded-sm border border-white/20"
                                        style="background-color: {value}"
                                      ></span>
                                      <span class="font-mono text-xs text-gray-400">{value}</span>
                                    {/if}
                                  {/snippet}
                                </ColorWheel>
                              </div>
                            {/if}
                          </div>
                        </div>
                      </PopoverPanel>

                      <button
                        type="button"
                        onclick={() => patchConfig('the branding', { [option.key]: !on } as never)}
                        title="{option.hint} ({on ? 'on' : 'off'})"
                        aria-pressed={on}
                        class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition-colors {on
                          ? 'hover:bg-raise/10 text-gray-50'
                          : 'hover:bg-raise/5 text-gray-400 hover:text-gray-200'}"
                      >
                        <span class="min-w-0 flex-1 truncate">{option.label}</span>
                        <!-- On or off said by a dot rather than by flooding the
                             row. Three full-width bars of solid violet is a lot
                             of colour for three switches, and the colour was
                             doing a job a six-pixel mark does just as well. -->
                        <span
                          class="h-1.5 w-1.5 shrink-0 rounded-full {on
                            ? 'bg-violet-400'
                            : 'bg-gray-700'}"
                        ></span>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- One per row. They were a wrapping pair with a 9rem minimum,
                   which in a panel this wide means two cramped columns rather
                   than the two comfortable ones it was written for. -->
              <div class="mb-5 grid gap-4">
                <div class="min-w-0">
                  <label class={labelClass} for="opt-aspect">Aspect</label>
                  <select
                    id="opt-aspect"
                    class={fieldClass}
                    value={config.aspect}
                    onchange={(e) =>
                      patchConfig('the frame', { aspect: e.currentTarget.value as never })}
                  >
                    <option value="9:16">9:16 vertical</option>
                    <option value="1:1">1:1 square</option>
                    <option value="16:9">16:9 landscape</option>
                  </select>
                </div>
                <div class="min-w-0">
                  <!-- Blur is the one choice here with a real render cost, so the
                   label carries the warning. Measured at roughly a sixth of the
                   render on a 90-second clip. -->
                  <div class="mb-1 flex flex-wrap items-baseline gap-x-2">
                    <label class="text-sm text-gray-400" for="opt-fill">
                      Footage that doesn't fit
                    </label>
                    {#if config.fill === 'blur'}
                      <span class="flex items-center gap-1 text-[11px] text-amber-400">
                        <svg
                          class="h-3 w-3 shrink-0 self-center"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path
                            d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                          />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Adds 15% to render time
                      </span>
                    {/if}
                  </div>
                  <select
                    id="opt-fill"
                    class={fieldClass}
                    value={config.fill}
                    onchange={(e) =>
                      patchConfig('the look', { fill: e.currentTarget.value as never })}
                  >
                    <option value="blur">Blurred background</option>
                    <option value="black">Black bars</option>
                    <option value="crop">Crop to fill</option>
                  </select>
                </div>
              </div>
              <div
                class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4"
              >
                <!-- Tone used to sit here, and is gone: every footage effect
                   carries its own grade, so this was a second place to decide
                   the same thing and the two stacked. Black and white, Warm and
                   Cool are effects now, in the Grades pack below. The field is
                   still rendered for clips that already carry one — a preset
                   clears it, since every preset names `tone: 'none'`. -->
                <div>
                  <label class={labelClass} for="opt-speed">Speed ({config.speed}×)</label>
                  <input
                    id="opt-speed"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={config.speed}
                    onchange={(e) =>
                      patchConfig('the look', { speed: Number(e.currentTarget.value) })}
                    class="w-full accent-violet-500"
                  />
                </div>
              </div>
            {/if}

            <!-- What happens to the finished clip: where it stands, and the ways
           it moves on. Releasing is the far end of the job and belongs at the
           far end of the column. -->

            {#if section === 'send'}
              <SendPanel
                {selected}
                {config}
                {look}
                {outputMedia}
                {statusLine}
                {tagNames}
                {job}
                {canSendForReview}
                {canSchedule}
                {sendAction}
                locale={data.settings?.locale ?? 'nb-NO'}
                account={data.profile?.name || data.settings?.title || 'Your account'}
                posts={data.posts}
                onqueuegap={async (days) => {
                  await autosave.run('the queue gap', () =>
                    setQueueGap({ projectId: selected.id, days })
                  );
                  await invalidateAll();
                }}
                onpreviewlink={handlePreviewLink}
                onunqueue={handleUnqueue}
                bind:queueDialogOpen
                bind:reviewConfirmOpen
              />
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/snippet}

  <!-- The render and what happens to it. On a phone this is the Preview half,
       so the video and the buttons that act on it arrive together — no scrolling
       past the whole settings column to see what you just rendered. -->
  {#snippet preview()}
    <!-- Only where there is no video yet. Once there is one, the Cancel button
         below carries the progress and this would be saying it twice. -->
    {#snippet renderProgress()}
      <div class="w-full">
        <div class="mb-1 flex justify-between text-xs text-gray-400">
          <span>{job?.status === 'queued' ? 'Queued…' : 'Rendering…'}</span>
          <span class="tabular-nums">{job?.progress ?? 0}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            class="h-full bg-violet-500 transition-all"
            style="width: {job?.progress ?? 0}%"
          ></div>
        </div>
      </div>
    {/snippet}

    <!-- Takes whatever height is left once the controls below have had
         theirs, so the picture is as big as the window allows. -->
    <div class="flex min-h-0 flex-1 items-center justify-center">
      {#if watchingRender}
        <!-- The file that goes out, played as it is.
           Nothing is drawn over it: the captions, the branding and the look are
           burned into it already, and drawing them twice would be worse than
           not drawing them at all.

           Making the file lives here too, over the picture it makes. Render is
           an action on the render — asking for one from a column about posting
           and scheduling meant the button and its result were never on screen
           together, and the first thing you did after pressing it was come
           back here to look. -->
        <div class={previewFrameClass} style="aspect-ratio: {previewAspect}">
          {#if outputMedia}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={renderEl}
              src={outputMedia.url}
              poster={outputMedia.thumbnailUrl ?? undefined}
              onloadedmetadata={(e) => (renderLength = e.currentTarget.duration || 0)}
              class={previewMediaClass}
            ></video>
          {:else}
            <!-- No render yet. The row above says what to do about it, so this
                 only has to say what you are looking at. -->
            <div class="flex h-full w-full items-center justify-center bg-black">
              <p class="text-sm text-gray-500">Nothing rendered yet</p>
            </div>
          {/if}
        </div>
      {:else if stageShots.length > 0}
        <!-- The clip itself, playing, with nothing rendered.

           The shots are the proxies made at upload, cut to the strip's own
           arrangement; the captions, the branding and the look go over them the
           way they went over a proof. What used to need a render and a wait is
           now a clock and two video elements, and it is never stale, because
           nothing was cached to go stale.

           `overflow-hidden` on the frame, because a move is a transform on the
           picture and a transform is not clipped by its parent unless the
           parent says so. The overlays stay outside it on purpose: the render
           burns captions in after the look, so they do not travel with the
           picture there either. -->
        <div class={previewFrameClass} style="aspect-ratio: {previewAspect}">
          <ClipStage
            shots={stageShots}
            {clock}
            frame={{ width: look.frame.width, height: look.frame.height }}
            fill={config.fill}
            blurStrength={advanced.blurStrength}
            fadeSeconds={advanced.clipFadeSeconds}
            pictureStyle={lookStyle}
            fps={advanced.fps}
          />
          <FootageLook svg={look.svg} overlay={look.overlay} />
          <ClipOverlay
            captions={previewCaptions}
            config={previewConfig}
            adv={advanced}
            at={clock.at}
            rehearse={rehearsal}
            graphic={stageGraphic('intro')?.thumbnailUrl || stageGraphic('intro')?.url || null}
            watermarkGraphic={stageGraphic('watermark')?.thumbnailUrl ||
              stageGraphic('watermark')?.url ||
              null}
            introSeconds={introShown}
            outroGraphic={stageGraphic('outro')?.thumbnailUrl || stageGraphic('outro')?.url || null}
            bodySeconds={lead + layout.body}
            leadSeconds={lead}
            leadPoster={config.introHold ? (timelineClips[0]?.poster ?? null) : null}
            {accent}
          />
        </div>
      {:else}
        <!-- Nothing on the strip, so the box says so — in the shape the clip
             will be, at the aspect it is set to.

             It was a dashed box the size of whatever was around it, which told
             you nothing you didn't know and, worse, didn't show the one thing
             that is already decided about an empty clip: how tall and narrow
             it is. The frame is the same outline the drop zones use, so it
             reads as somewhere something goes rather than as a thing that
             failed to load. -->
        <div
          class="{previewFrameClass} flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-700 bg-transparent px-6 text-center"
          style="aspect-ratio: {previewAspect}"
        >
          {#if isRendering}
            {@render renderProgress()}
          {:else}
            <p class="text-sm text-gray-400">No media yet</p>
            <p class="max-w-[22ch] text-xs text-gray-500">
              Add footage in Content, and it lands on the strip below.
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- The score, out of sight: the transport plays the clip, and the beds
         are part of the clip. It used to be one element for whichever bed was
         selected, which could only ever play the music on its own — against a
         picture that wasn't moving. -->
    <ClipBeds
      beds={stageBeds}
      {clock}
      volume={config.musicOnly ? 1 : advanced.musicBedVolume}
      fadeSeconds={advanced.bedFadeSeconds}
      {footageAudible}
    />

    <!-- Where the clip stands, and a door to everything about that.

         In the pane, under the buttons that act on the render, because that is
         what its whole contents are about — this clip, finished, on its way
         out. On the left it sat among the fields that decide what the clip *is*
         and read as one of them.

         It was a card carrying a status line, an approve-or-reject strip, a
         list of posts and the queue's dates — the whole downstream life of the
         clip, sitting under the editor and pushing the timeline's own controls
         further from it. None of it is read while you are cutting, and most of
         it is read once. So: one line here, the rest behind it. -->
  {/snippet}

  <!-- The timeline runs under both panes rather than inside either, because
       it measures the whole clip and wants every pixel of the page to do it.
       Here it also stops scrolling away from the fields it drives.

       Always, with nothing to gate it on. It was shown once there was media in
       the pool, which was the same mistake one step back: removing the last
       clip emptied the pool and took the strip with it, along with the beds,
       the captions and the effects still on it — and the target for putting
       anything back. The empty strip is what you place onto, so the one moment
       it must not disappear is the moment there is nothing on it. -->
  {#snippet footer()}
    <!-- Clipped, so nothing in here can widen the page.

         The strip is a few thousand pixels across and scrolls inside its own
         box, but everything else in the footer — a minimap bar, a block drawn
         at a percentage that rounds past the edge — sits in normal flow, and
         anything that overhangs by even a pixel gives the whole document a
         horizontal scrollbar. Which is how clicking the far end of the
         minimap ended up sliding the entire editor sideways. -->
    <div class="overflow-x-hidden border-t border-gray-800 bg-gray-950">
      <!-- The divider. A row of its own rather than an edge on the panel, so
           there is something to aim at: a two-pixel border is a target nobody
           hits on the first go. -->
      {#if !stripHidden}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          role="separator"
          aria-label="Drag to resize the timeline"
          aria-orientation="horizontal"
          class="h-1.5 cursor-row-resize bg-transparent transition-colors hover:bg-violet-500/40"
          onpointerdown={(e) => resizeStrip(e, stripHeight ?? stripBox?.clientHeight ?? STRIP_MIN)}
        ></div>
      {/if}

      <!-- Above the strip, because it scrubs against it and because four
           players with four sets of controls said the same thing four times.
           It stays when the strip is put away: the picture still plays. -->
      <!-- Three groups, so the transport is centred on the row rather than on
           whatever is left after the verbs: the selection changes how wide the
           left-hand group is, and play should not move when it does. -->
      <!-- The row keeps its own gutter. It used to come from the transport's
           padding, which meant the one column that happened to have some gave
           the whole row its height.

           Minus whatever the drag separator above already contributes: that
           row is transparent until you hover it, so with the strip open it
           reads as part of the gutter, and adding a full one under it made the
           controls sit lower when the strip was open than when it was away. -->
      <div
        class="grid grid-cols-[1fr_auto_1fr] items-center gap-1 pr-2 pb-1.5 {stripHidden
          ? 'pt-1.5'
          : ''}"
      >
        <!-- The switches for whatever is selected, and nothing else.
             This row used to carry everything a block could be told, including
             buttons that only took you somewhere else to tell it. What has a
             *value* — the framing, the look, the words — is in the panel now,
             where properties go. What is simply on or off stays here, because
             a switch is a thing you flick while watching, and going to a panel
             to flick it is a trip you shouldn't have to make. -->
        <div class="flex min-w-0 items-center gap-1 pl-2">
          {#if chosenShot}
            {@const shot = chosenShot}
            {@render toggle(
              'Fades up at its start',
              Boolean(shot.fadeIn),
              () => fadeShot(shot.id, { fadeIn: !shot.fadeIn }),
              'M4 19 L20 5 L20 19 Z'
            )}
            {@render toggle(
              'Fades away at its end',
              Boolean(shot.fadeOut),
              () => fadeShot(shot.id, { fadeOut: !shot.fadeOut }),
              'M20 19 L4 5 L4 19 Z'
            )}
            {#if !mediaById.get(shot.mediaId)?.mimeType?.startsWith('image/')}
              {@render toggleIcon(
                shot.muted ? 'Silent' : 'Keeps its own sound',
                !shot.muted,
                () => muteShot(shot.id, !shot.muted),
                shot.muted ? SpeakerXMark : SpeakerWave
              )}
            {/if}
          {:else if chosenBed}
            {@const bed = chosenBed}
            {@render toggle(
              'Comes up at its start',
              Boolean(bed.fadeIn),
              () => patchBed(bed.id, { fadeIn: !bed.fadeIn }),
              'M4 19 L20 5 L20 19 Z'
            )}
            {@render toggle(
              'Goes away at its end',
              Boolean(bed.fadeOut),
              () => patchBed(bed.id, { fadeOut: !bed.fadeOut }),
              'M20 19 L4 5 L4 19 Z'
            )}
            {@render toggleIcon(
              'Drops under anything spoken',
              Boolean(bed.duck),
              () => patchBed(bed.id, { duck: !bed.duck }),
              SpeakerWave
            )}
          {/if}
        </div>
        <div class="flex items-center gap-2 justify-self-center">
          <ClipTransport {clock} disabledReason={nothingToPlay} ready={sources.length > 0} />
          {#if canSwitchView}
            <!-- Which picture plays, beside the button that plays it.
                 It used to sit above the frame, which made it a caption on the
                 video rather than a control — and it only appeared once a
                 render existed, so the place rendering now lives was reachable
                 only after you had rendered.

                 The dot on Full is the one thing this row has to say about the
                 render: that the edit has moved past it. While one is being
                 made the label carries the percentage instead, so the progress
                 is legible from the Preview side too. -->
            <div class="h-5 w-px shrink-0 bg-gray-700"></div>
            <div
              class="flex items-stretch rounded-lg border border-gray-700 bg-gray-950/60 p-0.5 text-xs"
              role="group"
              aria-label="Which picture plays"
            >
              <button
                onclick={() => (watching = 'edit')}
                aria-pressed={!watchingRender}
                title="The clip playing itself, live"
                class="rounded-md px-2.5 py-1 transition-colors {!watchingRender
                  ? 'bg-gray-700 text-gray-50 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'}"
              >
                Preview
              </button>
              <button
                onclick={() => (watching = 'render')}
                aria-pressed={watchingRender}
                title={outputMedia ? 'The rendered file' : 'Nothing rendered yet'}
                class="flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors {watchingRender
                  ? 'bg-gray-700 text-gray-50 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'}"
              >
                Full
                {#if isRendering}
                  <span class="text-link-strong tabular-nums">{job?.progress ?? 0}%</span>
                {:else if job?.status === 'failed'}
                  <span
                    class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
                    title="The last render failed. The reason is under Send"
                  ></span>
                {:else if finalStale || !outputMedia}
                  <span
                    class="h-1.5 w-1.5 shrink-0 rounded-full {outputMedia
                      ? 'bg-amber-400'
                      : 'bg-gray-600'}"
                    title={outputMedia ? 'Behind the edit' : 'Nothing rendered yet'}
                  ></span>
                {/if}
              </button>
            </div>

            <!-- Making the file, beside the switch that shows it.
                 One button in two states — "Re-render" and the progress it
                 turns into — so it keeps its shape while a render runs rather
                 than swapping one size and colour for another mid-row. Quiet
                 chrome, like everything else here: it was a solid blue that
                 appeared nowhere else in the admin, and the thing that has to
                 catch the eye is the dot on Full, not the button.
                 It was a bar above the picture, which cost both views the same
                 strip of height whether or not there was anything to say. Here
                 it takes a row that already exists, appears only when there is
                 something to do, and leaves every pixel of both pictures to
                 the pictures. -->
            {#if isRendering}
              <button
                onclick={handleStop}
                title="Stop the render"
                class="relative shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs whitespace-nowrap text-gray-200 hover:border-red-800 hover:bg-red-950/60 hover:text-red-200"
              >
                <span
                  class="absolute inset-y-0 left-0 bg-violet-600/40 transition-all duration-300"
                  style="width: {job?.progress ?? 0}%"
                ></span>
                <span class="relative flex items-center gap-1.5">
                  <span class="tabular-nums">{job?.progress ?? 0}%</span>
                  <span class="text-gray-500">·</span>
                  <span>Cancel</span>
                </span>
              </button>
            {:else if renderReady}
              <button
                onclick={() => handleRender()}
                title="The full-size render, with everything burned in. The only one anything downstream uses"
                class="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-gray-50"
              >
                {outputMedia ? 'Re-render' : 'Render'}
              </button>
            {/if}
          {/if}
        </div>
        <div class="flex items-center justify-end gap-1">
          {#if zoomTools && !stripHidden}
            {@const at = zoomTools.now()}
            <div class="flex shrink-0 items-center gap-1 text-gray-500">
              <button
                type="button"
                onclick={() => zoomTools?.out()}
                disabled={at <= zoomTools.min()}
                title="Show more of the clip"
                aria-label="Zoom out"
                class="rounded p-1 transition-colors hover:bg-gray-800 hover:text-gray-50 disabled:opacity-30"
              >
                <Icon src={MagnifyingGlassMinus} size="16" solid />
              </button>
              <input
                type="range"
                min={zoomTools.min()}
                max={zoomTools.max}
                step="1"
                value={at}
                aria-label="How much of the clip is on screen"
                class="light:bg-gray-600 h-1 w-20 rounded-full bg-gray-700 accent-violet-500"
                oninput={(e) => zoomTools?.set(Number(e.currentTarget.value))}
              />
              <button
                type="button"
                onclick={() => zoomTools?.in()}
                disabled={at >= zoomTools.max}
                title="Look closer"
                aria-label="Zoom in"
                class="rounded p-1 transition-colors hover:bg-gray-800 hover:text-gray-50 disabled:opacity-30"
              >
                <Icon src={MagnifyingGlassPlus} size="16" solid />
              </button>
              <button
                type="button"
                onclick={() => zoomTools?.fit()}
                title="Fit the whole clip"
                aria-label="Fit the whole clip"
                class="rounded p-1 transition-colors hover:bg-gray-800 hover:text-gray-50"
              >
                <Icon src={ArrowsRightLeft} size="16" solid />
              </button>
            </div>
          {/if}
          {#if !stripHidden}
            <button
              type="button"
              onclick={() => (overview = !overview)}
              title={overview ? 'Hide the overview' : 'Show the overview'}
              aria-label={overview ? 'Hide the overview' : 'Show the overview'}
              aria-pressed={overview}
              class="shrink-0 rounded-md p-1.5 transition-colors hover:bg-gray-800 hover:text-gray-50 {overview
                ? 'text-gray-300'
                : 'text-gray-500'}"
            >
              <Icon src={MapIcon} size="16" solid />
            </button>
          {/if}
          <button
            type="button"
            onclick={() => (stripHidden = !stripHidden)}
            title={stripHidden ? 'Show the timeline' : 'Hide the timeline'}
            aria-label={stripHidden ? 'Show the timeline' : 'Hide the timeline'}
            aria-expanded={!stripHidden}
            class="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-50"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d={stripHidden ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Scrolls inside its own height once one has been chosen, so dragging
           the divider up can't leave rows nobody can reach. -->
      <div
        bind:this={stripBox}
        class="{stripHidden ? 'hidden' : ''} {stripHeight === null ? '' : 'overflow-y-auto'}"
        style={stripHeight === null ? undefined : `height: ${stripHeight}px`}
      >
        <ClipTimeline
          height={stripHidden ? null : stripHeight}
          {overview}
          onzoom={(tools) => (zoomTools = tools)}
          duration={layout.duration}
          clips={timelineClips}
          {captions}
          anchors={captionAnchors(advanced)}
          effects={placedEffects}
          wideEffect={clipWideEffect(config)}
          oneffects={setPlacedEffects}
          oncaptions={setCaptions}
          onmute={muteShot}
          onfade={fadeShot}
          onremove={(kind, id) => (kind === 'clip' ? dropSource(id) : dropTrack(id))}
          oncaptionremove={deleteCaption}
          onfxremove={deletePlacedEffect}
          onripple={async (from, shift) => {
            /*
             * Everything from a point onwards, moved together.
             *
             * Written as one unit of work: a ripple that saved half of itself
             * would leave the clip in an arrangement nobody chose, and the
             * retry you want after a failure is the whole gesture, not the
             * three placements that happened to get through.
             *
             * Captions go in a single write because they live in one column;
             * clips and beds are rows, so they are one call each.
             */
            const movedSources = sources.filter((s) => (s.start ?? 0) >= from - 0.001);
            const movedTracks = data.audio.filter((a) => (a.start ?? 0) >= from - 0.001);
            const movedCaptions = captions.some((c) => c.start >= from - 0.001);
            if (!movedSources.length && !movedTracks.length && !movedCaptions) return;

            await autosave.run('the move', async () => {
              for (const source of movedSources) {
                await updateSource({
                  id: source.id,
                  start: tidy(Math.max(0, (source.start ?? 0) + shift))
                });
              }
              for (const track of movedTracks) {
                await updateAudio({
                  id: track.id,
                  start: tidy(Math.max(0, (track.start ?? 0) + shift)),
                  // A bed with no end of its own keeps not having one.
                  end: track.end == null ? null : tidy(track.end + shift)
                });
              }
              if (movedCaptions) {
                await setCaptions(
                  captions.map((c) =>
                    c.start >= from - 0.001
                      ? {
                          ...c,
                          start: tidy(Math.max(0, c.start + shift)),
                          end: tidy(Math.max(0, c.end + shift))
                        }
                      : c
                  )
                );
              }
            });
            await invalidateAll();
          }}
          onpreview={(kind, id) => {
            // Pressing the same block again puts the render back. The way out
            // is the way in, so there's no button under the picture saying so —
            // and which block you're looking at is already said by the ring
            // around it. Playing it is the transport's job now.
            if (showing?.kind === kind && showing.id === id) {
              selection.clear();
              return;
            }

            selection.select({ kind, id });
          }}
          onclip={async (id, changes) => {
            const source = sources.find((s) => s.id === id);
            if (!source) return;

            const item = mediaById.get(source.mediaId);
            const length = (item?.durationMs ?? 0) / 1000;
            /*
             * A still has no file length to be bounded by. Everywhere else here
             * clamps against the footage that exists, and a picture reports none
             * — so the same arithmetic pinned every edge to zero and the save
             * bailed before it was written. Held pictures are bounded by the
             * clip instead, which is to say by nothing this handler knows about.
             */
            const held = Boolean(item?.mimeType?.startsWith('image/'));

            /*
             * Slipped: the window moves through the footage, the block doesn't
             * move at all. Both trim points shift by the same amount, which is
             * what keeps the length — and so the placement — identical.
             */
            if (changes.slip !== undefined) {
              // Nothing to slip through on a still; the same frame either way.
              if (held) return;
              const from = (source.trimStart ?? 0) + changes.slip;
              const to = (source.trimEnd ?? length) + changes.slip;
              if (from < -0.01 || to > length + 0.01) return;
              await autosave.run('the trim', () =>
                updateSource({ id, trimStart: tidy(from), trimEnd: tidy(to) })
              );
              await invalidateAll();
              return;
            }

            // Moved whole: where it starts and which row it's in. The footage
            // is untouched, so the trim isn't part of this.
            if (changes.start !== undefined || changes.lane !== undefined) {
              await autosave.run('the placement', () =>
                updateSource({ id, start: changes.start, lane: changes.lane })
              );
              await invalidateAll();
              return;
            }

            const speed = config.speed || 1;
            const head = changes.head ?? 0;
            const tail = changes.tail ?? 0;

            /*
             * Timeline seconds back into source seconds. Cutting into the front
             * moves the in-point later and the placement with it, so what's
             * left stays where it was on the timeline rather than sliding back.
             *
             * Both trims are always written, even when only one moved: the
             * renderer reads them as a pair, and one without the other means
             * "use the whole file".
             */
            const from = Math.max(0, (source.trimStart ?? 0) + head * speed);
            const grown = (source.trimEnd ?? length) + tail * speed;
            const to = held ? grown : Math.min(length, grown);
            if (to - from < 0.1) return;

            await autosave.run('the trim', () =>
              updateSource({
                id,
                trimStart: tidy(from),
                trimEnd: tidy(to),
                start: tidy(Math.max(0, (source.start ?? 0) + head))
              })
            );
            await invalidateAll();
          }}
          {tracks}
          onaudio={patchBed}
          {clock}
          ondissolve={setDissolve}
          dissolveSeconds={advanced.xfadeSeconds}
          onfit={(id, fit) => patchFraming(id, { fit })}
          onframing={patchFraming}
        />
      </div>
    </div>
  {/snippet}
</EditorPreview>

{#if queueDialogOpen}
  <QueueClipDialog
    nextSlot={data.nextSlot ? new Date(data.nextSlot) : null}
    scheduledFor={toLocalInput(selected.scheduledFor)}
    queued={selected.status === 'queued'}
    locale={data.settings?.locale ?? 'nb-NO'}
    publishConfigured={data.publishConfigured}
    onchoose={handleQueueChoice}
    onclose={() => (queueDialogOpen = false)}
  />
{/if}

{#if selected}
  <PhoneUploadDialog
    bind:open={phoneUploadOpen}
    projectId={selected.id}
    label="Add footage or music to “{selected.name}”"
  />
{/if}

{#if mediaPickerOpen}
  <MediaPicker
    label="Add footage, stills or music"
    media={data.media}
    kind="all"
    noCrop
    modal
    multiple
    excludeRoles={['render', 'proof']}
    selectedIds={[]}
    onmultiselect={(ids) => {
      mediaPickerOpen = false;
      handleAddMedia(ids);
    }}
    bind:open={mediaPickerOpen}
  />
{/if}

<!-- Everything that happens to a clip after it is cut: where it stands, the
     verdict, where it went. Behind a door because none of it is read while you
     are cutting, and most of it is read once. -->
<!-- Asked before sending, because this is the one action here that leaves the
     machine: it fires a webhook and hands someone a link. Everything else in
     this editor is undone from a toast; a review is undone by explaining
     yourself to a person, and re-sending is another notification rather than a
     correction.

     It also has to say *what* is being sent, which is not necessarily what you
     are looking at — Review sends the render, and you are most likely watching
     the edit itself, which the render may not have caught up with. -->
<!-- A dialog rather than the browser's `confirm`, for the same reason Review
     has one: the sentence that matters is what goes with it, and a native
     prompt can't say that a rendered video and its posts go too. This one can
     also be dismissed the way every other dialog here is. -->
{#if deleteConfirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5">
      <h2 class="text-base font-semibold text-gray-50">Delete this clip?</h2>
      <p class="mt-2 text-sm text-gray-400">
        The clip, its renders and everything on its timeline go. The footage and music stay in your
        media library.
      </p>
      <p class="mt-2 text-sm text-red-300/80">This one cannot be undone.</p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          onclick={() => (deleteConfirmOpen = false)}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          Keep it
        </button>
        <button
          onclick={() => handleDelete(selected.id)}
          class="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-600 hover:text-white"
        >
          Delete clip
        </button>
      </div>
    </div>
  </div>
{/if}

{#if reviewConfirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5">
      <h2 class="text-base font-semibold text-gray-50">
        {selected.status === 'review' ? 'Send it again?' : 'Send for review?'}
      </h2>
      <p class="mt-2 text-sm text-gray-400">
        This sends the full render and a preview link to whoever reviews clips.
        {selected.status === 'review' ? ' They have already been sent this clip once.' : ''}
      </p>

      {#if !outputMedia}
        <p
          class="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-200"
        >
          There is no full render yet — only a quick one, which is not what gets sent. Render it
          properly first.
        </p>
      {:else if finalStale}
        <p
          class="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-200"
        >
          The clip has changed since the full render was made, so they will see the older cut.
          Render again first if that matters.
        </p>
      {/if}

      <div class="mt-5 flex justify-end gap-2">
        <button
          onclick={() => (reviewConfirmOpen = false)}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onclick={handleSendForReview}
          disabled={!outputMedia}
          class="light:text-teal-700 light:hover:text-white rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-300 transition-colors hover:border-teal-600 hover:bg-teal-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected.status === 'review' ? 'Send again' : 'Send for review'}
        </button>
      </div>
    </div>
  </div>
{/if}
