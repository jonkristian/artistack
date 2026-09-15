<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { keepColor } from '$lib/brand-colors.remote';
  import MediaPicker from '$lib/components/ui/MediaPicker.svelte';
  import {
    ColorWheel,
    EmojiPicker,
    LengthMeter,
    SaveStatus,
    TagInput,
    ToggleSwitch
  } from '$lib/components/ui';
  import { Autosave } from '$lib/utils/autosave.svelte';
  import { renderFingerprint } from '$lib/clips/fingerprint';
  import { clipLayout } from '$lib/clips/layout';
  import { secs, tidy } from '$lib/clips/time';
  import { clipWideEffect, pictureCss } from '$lib/clips/effects';
  import {
    ClipOverlay,
    ClipTimeline,
    EffectPicker,
    FootageLook,
    type TimelineClip,
    type TimelineTrack
  } from '$lib/components/clips';
  import { SectionCard } from '$lib/components/cards';
  import { EditorPreview } from '$lib/components/ui';
  import { PhoneUploadDialog, QueueClipDialog } from '$lib/components/dialogs';
  import { formatDuration } from '$lib/utils/upload';
  import { fieldClass, labelClass, numberClass } from '$lib/utils/classes';
  import { insertAtCursor, shortName } from '$lib/utils/text';
  import {
    DEFAULT_CLIP_CONFIG,
    DEFAULT_ADVANCED_CONFIG,
    captionAnchors,
    stageGraphicId,
    type BrandStage,
    captionBackdrop,
    captionColor,
    ADVANCED_GROUPS,
    CLIP_PRESETS,
    CLIP_STATUS_LABELS,
    CLIP_STATUS_DOTS,
    PLATFORM_NAMES,
    type ClipRotation,
    type ClipRenderConfig,
    type PlacedEffect,
    type ClipAdvancedConfig,
    type TimedCaption
  } from '$lib/clips/types';
  import type { PageData } from './$types';
  import {
    updateProject,
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
    getPostSheet,
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
  let captionField = $state<HTMLTextAreaElement>();

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
  let previewVideo = $state<HTMLVideoElement>();

  /**
   * Every write on this page goes through here.
   *
   * There is no Save button in the studio — a change is committed as you make
   * it — so this is the only thing standing between a refused write and finding
   * out about it on the next reload.
   */
  const autosave = new Autosave();

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
  /** The source clip whose trim and mute are open, or null. */
  let openSourceId = $state<number | null>(null);
  /** The track whose settings are open, or null. */
  let openTrackId = $state<number | null>(null);
  let phoneUploadOpen = $state(false);
  let postSheet = $state<{ markdown: string } | null>(null);

  const selected = $derived(data.project);

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
  /**
   * Whether the *final* render is behind the edit.
   *
   * Separate from `stale`, which follows whichever render you happen to be
   * watching. Review sends the full render and nothing else, so what matters
   * before sending is whether that one is current — you can be looking at a
   * fresh proof of an edit whose finished file is an hour old.
   */
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

  const stale = $derived.by(() => {
    const against = proofMedia ? selected.proofFingerprint : selected.renderFingerprint;
    if (!shownMedia || !against) return false;
    return (
      renderFingerprint({
        config,
        captions,
        sources,
        audio: tracks,
        defaultGraphicMediaId: data.defaultGraphicMediaId
      }) !== against
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

  /**
   * What the editor's own player and timeline show.
   *
   * The proof when there is one, because it's the newer picture of the edit —
   * and it only exists until the next full render, which clears it. Everything
   * that leaves this page (the post sheet, the preview link, review,
   * publishing) reads `outputMedia` instead, and must: a proof is half size
   * with the cheap filters on, and is never the thing that goes out.
   */
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
   * The selected source, shown on its own in the pane instead of the render.
   *
   * Clips only. A bed has nothing to look at, so its row keeps the audio bar it
   * already had; taking over the pane to show a rectangle with a scrubber in it
   * would cost the render its place for nothing.
   */
  const borrowed = $derived.by(() => {
    if (openSourceId == null) return null;
    const row = sources.find((source) => source.id === openSourceId);
    const item = row ? mediaById.get(row.mediaId) : undefined;
    return row && item ? { row, item } : null;
  });

  /**
   * The selected bed. It keeps the render in the pane rather than taking it
   * over — there is nothing to look at, and the render is what its "comes in
   * at" and "ends at" are marked against.
   */
  const selectedTrack = $derived(
    openTrackId != null ? (tracks.find((t) => t.id === openTrackId) ?? null) : null
  );

  /** The pane's player while it's lent out, so trim points can be marked on it. */
  let sourceVideo = $state<HTMLVideoElement>();

  /** The selected bed's own bar, for the same reason. */
  let bedAudio = $state<HTMLAudioElement>();

  /**
   * Whichever player the selection is showing in — the pane for a clip, the
   * bar in the panel for a bed.
   */
  const activePlayer = $derived<HTMLMediaElement | undefined>(
    borrowed ? sourceVideo : selectedTrack ? bedAudio : undefined
  );

  /**
   * Whether it's running, tracked from the player itself rather than from
   * whether we last asked it to.
   *
   * The person can also press the player's own controls, and a button that
   * decided what it showed from its own history would then be offering to pause
   * something already stopped.
   */
  let selectionPlaying = $state(false);

  $effect(() => {
    const player = activePlayer;
    if (!player) {
      selectionPlaying = false;
      return;
    }
    const sync = () => (selectionPlaying = !player.paused);
    sync();
    player.addEventListener('play', sync);
    player.addEventListener('pause', sync);
    player.addEventListener('ended', sync);
    return () => {
      player.removeEventListener('play', sync);
      player.removeEventListener('pause', sync);
      player.removeEventListener('ended', sync);
    };
  });

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
    if (openSourceId === id) openSourceId = null;
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
    if (openTrackId === id) openTrackId = null;
    const done = await autosave.run('the removed track', () => removeAudio(id));
    await invalidateAll();
    if (done === undefined || !gone) return;
    toast.undoable('Track removed', async () => {
      await autosave.run('the restored track', () => restoreAudio(gone));
      await invalidateAll();
    });
  }

  /**
   * Where the preview video is, for the overlay.
   *
   * From the element's own events rather than a frame loop: `timeupdate` fires
   * about four times a second, which is enough for a caption that lasts four —
   * and a caption arriving a fifth of a second late is not a thing anyone can
   * see, where a render running every frame is a thing everyone can feel.
   */
  let previewAt = $state(0);

  /**
   * The preview's clock, followed frame by frame while it plays.
   *
   * `timeupdate` fires about four times a second, which is fine for a caption
   * that stays up for three and useless for anything shorter than the gap
   * between two of them: a dropout tears for a tenth of a second, so the odds
   * of a tick landing inside one are slim and it would show for a single frame
   * if it did. The effect was there and simply never drawn.
   *
   * Only while playing. Paused or scrubbing, `timeupdate` and `seeked` say
   * everything there is to say, and a loop running against a still picture is
   * sixty wake-ups a second to assign the same number.
   */
  let previewPlaying = $state(false);

  $effect(() => {
    if (!previewPlaying || !previewVideo) return;
    const video = previewVideo;
    let frame = requestAnimationFrame(function tick() {
      previewAt = video.currentTime;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * The clip's look at wherever the preview is, as CSS.
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
      previewAt
    );
    const refs = drawn.svg.map((_, index) => `url(#footage-look-${index})`).join(' ');
    return {
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
   * Three players show it — a proof, a lone source, a borrowed shot — and each
   * had its own ternary. A move needed a second property in all three, which is
   * three chances to add it twice and once not at all.
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

  /** Whether the status-and-review dialog is open. */
  let reviewOpen = $state(false);

  /** The pooled file whose footage is being turned, if any. */
  let turningId = $state<number | null>(null);

  /**
   * Bumped by the play buttons on the timeline when there's nothing playing yet
   * — the player they'd act on hasn't been mounted at the moment of the press.
   * A counter and not a boolean: pressing play on the same block twice has to
   * start it twice.
   */
  let playRequest = $state(0);
  let playServed = 0;

  $effect(() => {
    const player = activePlayer;
    const request = playRequest;
    if (!player || request === playServed) return;
    playServed = request;
    // A bed starts at its cue point. A clip's player already loaded with `#t=`
    // at the in-point, so that one only needs starting.
    if (selectedTrack) player.currentTime = selectedTrack.seek ?? 0;
    void player.play().catch(() => {});
  });

  const proofMedia = $derived(data.proofMedia ?? null);
  /**
   * Which of the two you are watching, when there are two.
   *
   * A proof is the newer picture of the edit, so it wins by default — but the
   * full render is the thing that goes out, and after tweaking something you
   * want to look back at what you had. There was no way back to it: a proof
   * simply took over until the next full render cleared it.
   *
   * Not remembered between visits. Which one you want depends on what you are
   * doing right now, and the newest is the right answer to arrive on.
   */
  let watching = $state<'proof' | 'final'>('proof');

  const shownMedia = $derived(
    watching === 'final' ? (outputMedia ?? proofMedia) : (proofMedia ?? outputMedia)
  );

  /**
   * One switch for both questions.
   *
   * Which of the two you are watching and which of the two you are about to
   * make are the same decision in practice — you look at a proof because you
   * are working, and at the final because you are finishing. So the button that
   * chooses also decides what Render does, and there is one fewer control and
   * no way for the two to disagree.
   */

  /** Whether what's on screen is a proof, which decides whether to draw over it. */
  const showingProof = $derived(Boolean(proofMedia) && shownMedia === proofMedia);

  /**
   * One shot, played straight, when there is no render to play.
   *
   * A clip you have just put footage on had nothing in the pane at all — and
   * the captions and effects are drawn over the video now rather than burned
   * into it, so the only thing a render was still buying in that state was the
   * assembly. With a single shot there is nothing to assemble: the proxy of
   * that shot, with the overlay on top, *is* the preview, and it is never stale
   * because nothing was cached to go stale.
   *
   * Strictly one shot. Two is a cut, and a cut is the one thing a single file
   * cannot show — it would be a preview that quietly disagrees with the strip.
   * Nothing here changes what a render does; it only fills a gap the render
   * used to be the only answer to.
   */
  const standIn = $derived.by(() => {
    if (shownMedia || sources.length !== 1) return null;
    const row = sources[0];
    const item = mediaById.get(row.mediaId);
    if (!item) return null;
    return { row, item, url: item.previewUrl ?? item.url };
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
        still: Boolean(item?.mimeType?.startsWith('image/')),
        fit: (source?.fit as 'crop' | 'black' | 'blur' | null) ?? null,
        zoom: source?.zoom ?? 1,
        pan: source?.pan ?? false
      };
    })
  );

  // Poll while a render is in flight. ffmpeg reports progress into the job row,
  // so this is the only way the UI learns about it.
  $effect(() => {
    if (!isRendering) return;
    const id = selected.id;

    const timer = setInterval(async () => {
      try {
        const status = await getRenderStatus(id);
        liveJob = status as JobShape;
        // A finished render adds a media row and sets outputMediaId, neither of
        // which is in the current page data.
        if (status && status.status !== 'queued' && status.status !== 'rendering') {
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
  // untouched.
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

  let showAdvanced = $state(false);

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
        { key: 'zoom', label: 'Slow zoom', hint: 'A slow push in across each clip.' },
        {
          key: 'xfade',
          label: 'Crossfade clips',
          hint: 'Dissolve between sources instead of cutting.'
        }
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
  let graphicOpen = $state<BrandStage | null>(null);
  let brandingRow = $state<HTMLElement | null>(null);

  /**
   * The graphic each stage will actually draw with, for its chip and the overlay.
   *
   * The site default when the stage has no mark of its own — the same fallback
   * the renderer applies, so the chip shows what will come out.
   */
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

  async function resetAdvanced() {
    if (!confirm('Reset every advanced dial to its default?')) return;
    advancedDraft = {};
    await patchAdvanced({ ...DEFAULT_ADVANCED_CONFIG });
    toast.success('Advanced settings reset');
  }

  /**
   * Everything picked goes into the pool, and nothing is placed.
   *
   * The two steps are deliberate. Adding a file and deciding where it goes are
   * different decisions, and welding them together is what made using one shot
   * twice mean picking it twice.
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

    const result = await autosave.run('the media', () =>
      addToPool({ projectId: selected.id, mediaIds: picked.map((m) => m.id) })
    );
    await invalidateAll();

    if (result === undefined) return;
    const added = result.added ?? 0;
    toast.success(
      added === 0
        ? 'Already in this clip'
        : `Added ${added} file${added > 1 ? 's' : ''} — place ${added > 1 ? 'them' : 'it'} on the timeline`
    );
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

  async function handleRender(proof = false) {
    const result = await attempt('Could not start the render', () =>
      startRender({ projectId: selected.id, proof })
    );
    if (!result) return;
    if (!result.success) {
      toast.error(result.message ?? 'Could not start the render');
      return;
    }
    liveJob = result.job as JobShape;
    toast.success(proof ? 'Quick render queued' : 'Render queued');
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
    else {
      reviewOpen = false;
      toast.success('Sent for review');
    }
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
      setScheduledDate({ projectId: selected.id, when })
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

  /**
   * A `datetime-local` input needs `YYYY-MM-DDTHH:mm` in local time, and
   * toISOString would hand it UTC — an hour or two off, silently.
   */
  function toLocalInput(value: Date | string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  async function handlePostSheet() {
    const sheet = await attempt('Could not build the post sheet', () =>
      getPostSheet({ projectId: selected.id, origin: window.location.origin })
    );
    if (sheet) postSheet = sheet;
  }

  function copyPostSheet() {
    if (!postSheet) return;
    navigator.clipboard.writeText(postSheet.markdown);
    toast.success('Post sheet copied');
  }

  // --- timed captions ---------------------------------------------------

  const captions = $derived((selected.captions ?? []) as TimedCaption[]);

  async function setCaptions(next: TimedCaption[]) {
    await patch('the captions', { captions: next });
  }

  async function deleteCaption(index: number) {
    // The whole list, not the removed line: putting one back where it was is
    // the same operation as never having taken it out, and the array is small.
    const before = captions;
    await setCaptions(captions.filter((_, i) => i !== index));
    toast.undoable('Caption removed', () => setCaptions(before));
  }
</script>

<!-- Bubble phase, so the thumbnail's own click has already run and the row
     counts as inside. -->
<svelte:window
  onclick={(e) => {
    if (graphicOpen && brandingRow && !brandingRow.contains(e.target as Node)) graphicOpen = null;
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') graphicOpen = null;
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
    class="flex shrink-0 items-center gap-1 text-xs text-gray-500 transition-colors hover:text-violet-400"
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

{#snippet linkAction(onclick: () => void, label: string, path: string)}
  <button
    type="button"
    {onclick}
    title={label}
    aria-label={label}
    class="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
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
        ? 'text-violet-400 hover:bg-violet-500/20 hover:text-violet-200'
        : 'text-gray-500 hover:bg-white/10 hover:text-gray-200'}"
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

<EditorPreview editorClass="lg:flex-1" previewClass="lg:w-2/5 lg:max-w-2xl lg:flex-none" padPreview>
  {#snippet editor()}
    <!-- Zero height, so the first card below starts at the top of the column
         and lines up with the video in the pane beside it. The status floats
         over the corner instead of holding a row open for the nine tenths of
         the time it has nothing to report. -->
    <div class="sticky top-0 z-30 flex h-0 justify-end">
      <SaveStatus {autosave} />
    </div>

    {#if !data.renderingAvailable}
      <div class="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm">
        <p class="font-medium text-amber-300">Rendering is unavailable</p>
        <p class="mt-1 text-amber-200/70">
          ffmpeg isn't installed on the server, so clips can't be rendered here.
        </p>
      </div>
    {/if}

    <div class="space-y-6">
      <!-- Post details. No heading: the Name field is the clip's title, so a
           label above it would just say the same thing twice. -->
      <SectionCard>
        <div
          class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
        >
          <div>
            <label class={labelClass} for="clip-name">Name</label>
            <input
              id="clip-name"
              class={fieldClass}
              value={selected.name}
              onblur={(e) => patch('the name', { name: e.currentTarget.value })}
            />
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
          </div>
          <div class="sm:col-span-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="text-sm text-gray-400" for="clip-desc">Description</label>
              <div class="flex items-center gap-2">
                <!-- The emoji, without the formatting either side of them: this
                     is posted as plain text, so a <b> would be typed out in the
                     caption rather than read as bold. -->
                <EmojiPicker
                  onpick={(emoji: string) =>
                    captionField &&
                    patch('the description', {
                      description: (captionText = insertAtCursor(captionField, emoji))
                    })}
                />
                {@render saveAsDefault('description')}
              </div>
            </div>
            <textarea
              id="clip-desc"
              rows="5"
              class={fieldClass}
              bind:this={captionField}
              value={selected.description ?? ''}
              placeholder="Keywords first — this becomes the post caption."
              oninput={(e) => (captionText = e.currentTarget.value)}
              onblur={(e) => patch('the description', { description: e.currentTarget.value })}
            ></textarea>
            <!--
              Both marks are ours, and neither is the platforms'. TikTok and
              Instagram take 2,200 characters, which is so far past what anyone
              reads that measuring against it says nothing — a bar that never
              moves is decoration.

              So: 100 is the fold, roughly what shows before “more” and the
              reason the field asks for keywords first, and 350 is a caption
              that has said what it came to say. Going past either is allowed;
              the post still sends.

              The hashtags and the campaign link the post sheet adds aren't
              counted here; they land after all of this.
            -->
            <LengthMeter
              value={captionText}
              limit={100}
              hard={350}
              split
              hint="Keywords first — roughly the first 100 characters show before “more”."
              softHint="Past the fold. Keep going if it's worth it — the rest is behind “more”."
              hardHint="Long for a caption. The platforms take it; people stop reading."
            />
          </div>
        </div>
      </SectionCard>

      <!-- Branding, on its own rather than buried under Look.

           It is a look decision — which mark the clip wears and where — but
           it is the one you make once and then leave alone, while the rest
           of Look is what you fiddle with. Sharing a card put the settled
           thing underneath the unsettled one.

           Not folded into the first card either: that one is the post — the
           name, the tags, the caption that gets typed into TikTok — and this
           is the render. -->

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
      <SectionCard>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            onclick={() => (mediaPickerOpen = true)}
            title="Footage and music both land here; place them on the timeline after"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <!-- "Add media", again: it puts files in this clip's list, and
               nothing on the strip. Naming it for the timeline was right for
               about an hour, while adding and placing were still one action. -->
            Add media
          </button>
          <button
            onclick={() => (phoneUploadOpen = true)}
            title="Show a QR to upload footage or music straight from a phone"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm whitespace-nowrap text-gray-300 transition-colors hover:bg-gray-700"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            From phone
          </button>
        </div>

        {#if pool.length === 0}
          <p class="text-sm text-gray-500">
            Nothing yet. Add footage, stills or music, then place it on the timeline.
          </p>
        {:else}
          <!-- Tiles, not rows.

               A row spent most of its width on nothing: a thumbnail the size of
               a stamp, a filename, and then several inches of gap before the
               buttons. As tiles the picture is the thing you actually recognise
               a clip by, three fit where one row did, and the whole list stops
               pushing the timeline down the page. -->
          <div
            class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-3"
          >
            {#each pool as entry (entry.id)}
              {@const item = mediaById.get(entry.mediaId)}
              {@const isAudio = Boolean(item?.mimeType?.startsWith('audio/'))}
              {@const isStill = Boolean(item?.mimeType?.startsWith('image/'))}
              {@const uses = isAudio
                ? tracks.filter((t) => t.mediaId === entry.mediaId).length
                : sources.filter((source) => source.mediaId === entry.mediaId).length}
              <div
                class="group overflow-hidden rounded-lg bg-gray-800/50 transition-colors hover:bg-gray-800"
              >
                <div class="relative aspect-[4/3] bg-gray-950">
                  {#if item?.thumbnailUrl || (isStill && item?.url)}
                    <img
                      src={item.thumbnailUrl ?? item.url}
                      alt=""
                      class="h-full w-full object-cover"
                    />
                  {:else}
                    <div class="flex h-full w-full items-center justify-center">
                      <svg
                        class="h-6 w-6 text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                  {/if}

                  <!-- How many times it is on the timeline, over the corner of
                       the picture: the one thing this list can say that the
                       strip can't, and "not placed" is a real state. -->
                  <span
                    class="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] {uses === 0
                      ? 'bg-black/70 text-gray-400'
                      : 'bg-black/70 text-gray-200'}"
                  >
                    {uses === 0 ? 'not placed' : uses === 1 ? 'placed' : `${uses}×`}
                  </span>
                </div>

                <p class="truncate px-2 pt-1.5 text-xs text-white" title={item?.filename}>
                  {item?.filename ?? 'Missing file'}
                </p>
                <div class="flex items-center gap-0.5 px-1 pb-1">
                  <span class="min-w-0 flex-1 truncate pl-1 text-[10px] text-gray-500">
                    <!-- A still has no running time of its own; how long it is
                         held is a property of where it sits on the strip. -->
                    {isStill ? 'Still' : formatDuration(item?.durationMs)}
                  </span>
                  {#if !isAudio}
                    {@render rowButton(
                      () => turnMedia(entry.mediaId),
                      "Turn a quarter — rewrites the footage, everywhere it's used",
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
      </SectionCard>

      <!-- Captions -->

      <!-- Music -->
      <!-- Look -->
      <!-- No title. Four pictures of the clip with its name under each says
           "look" more plainly than the word does, and the word cost a row. -->
      <SectionCard>
        <!-- The templates and nothing else. Each one is a still of this clip's
             own footage with that grade on it, which is the whole decision for
             most clips and the only part of it worth showing unprompted.

             The frame moved in behind Customise with the rest. It is genuinely
             not a look — it depends on what you shot, not the mood you want —
             but it is also 9:16 for every clip this studio exists to make, so
             standing at the front it was a question nobody needed to answer. -->
        <!-- Two presets per row even on the narrowest phone: they're compared
             against each other, and one per row makes that a scroll. -->
        <span class="mb-2 block text-xs tracking-wide text-gray-500 uppercase">Presets</span>
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
                  <div class="flex h-full w-full items-center justify-center px-2 text-center">
                    <span class="text-[10px] leading-tight text-gray-600">
                      Add footage to preview
                    </span>
                  </div>
                {/if}
              </div>
              <div class="p-2">
                <p
                  class="text-xs font-medium {activePreset === preset.id
                    ? 'text-violet-300'
                    : 'text-gray-300 group-hover:text-white'}"
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
                class="h-7 w-7 {showCustomise ? 'text-violet-300' : 'text-gray-600'}"
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
                  ? 'text-violet-300'
                  : 'text-gray-300 group-hover:text-white'}"
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
        <div class="relative mt-5" bind:this={brandingRow}>
          <span class="mb-2 block text-xs tracking-wide text-gray-500 uppercase">Branding</span>
          <div class="flex flex-wrap items-center gap-1.5">
            {#each BRANDING_OPTIONS as option (option.key)}
              {@const on = Boolean(config[option.key])}
              {@const stage = option.key as BrandStage}
              {@const mark = stageGraphic(stage)}
              <div
                class="flex items-stretch overflow-hidden rounded-md border transition-colors {on
                  ? 'border-violet-500 bg-violet-600/80'
                  : 'border-gray-700'}"
              >
                <button
                  type="button"
                  onclick={() => (graphicOpen = graphicOpen === stage ? null : stage)}
                  title={mark
                    ? `Drawn with ${mark.filename} — press to change`
                    : 'No graphic set — press to choose one'}
                  aria-label="Graphic used for {option.label.toLowerCase()}"
                  aria-expanded={graphicOpen === stage}
                  class="flex w-9 shrink-0 items-center justify-center bg-black/30 px-1 transition-colors hover:bg-black/50"
                >
                  {#if mark}
                    <img
                      src={mark.thumbnailUrl || mark.url}
                      alt=""
                      class="h-4 w-full object-contain"
                    />
                  {:else}
                    <span class="text-[10px] text-gray-500">?</span>
                  {/if}
                </button>
                <button
                  type="button"
                  onclick={() => patchConfig('the branding', { [option.key]: !on } as never)}
                  title={option.hint}
                  aria-pressed={on}
                  class="px-2.5 py-1 text-xs transition-colors {on
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-200'}"
                >
                  {option.label}
                </button>
              </div>
            {/each}
          </div>

          <!-- One list, under the row rather than under whichever thumbnail was
               pressed — but it writes to the stage whose thumbnail opened it, so
               the outro can carry something the watermark does not.

               Opening upwards, which is not a style choice. The editor pane
               scrolls, so it clips anything its children put outside it — and
               this row sits near the bottom, so a list dropping down was cut
               off at the timeline's edge with the options below that line
               unreachable: they were behind the cut, so the presses landed on
               whatever was drawn there instead. There is always room above,
               because the presets are. -->
          {#if graphicOpen}
            {@const stage = graphicOpen}
            <ul
              role="listbox"
              class="absolute bottom-full z-20 mb-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
            >
              {#each graphicOptions as option (option.value)}
                {@const chosen = option.value === String(stageGraphicId(config, stage) ?? '')}
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onclick={() => {
                      /*
                       * Which stage, read before the list is closed.
                       *
                       * `{@const}` is a reactive binding, not a snapshot — so
                       * `stage` follows `graphicOpen`, and clearing that first
                       * turned the key into `nullGraphicMediaId`. The schema
                       * drops what it does not recognise, so the save went
                       * through, reported success, and changed nothing.
                       */
                      const target = stage;

                      patchConfig('the branding', {
                        [`${target}GraphicMediaId`]:
                          option.value === '' ? null : Number(option.value)
                      } as never);
                      graphicOpen = null;
                    }}
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors {chosen
                      ? 'bg-violet-600/20 text-violet-200'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'}"
                  >
                    <!-- Site default and Random have no picture of their own,
                         so they keep the space to stay in line with the rest. -->
                    {#if 'image' in option}
                      <img
                        src={option.image}
                        alt=""
                        class="h-6 w-8 shrink-0 rounded bg-gray-950 object-contain"
                      />
                    {:else}
                      <span class="h-6 w-8 shrink-0"></span>
                    {/if}
                    <span class="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

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
            <p class="text-xs text-gray-500">These global settings affect the entire timeline.</p>
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
            <div class="mb-5 flex flex-wrap gap-4">
              <div class="min-w-36 flex-1">
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
              <div class="min-w-36 flex-1">
                <!-- Blur is the one choice here with a real render cost, so the
                   label carries the warning. Measured at roughly a sixth of the
                   render on a 90-second clip. -->
                <div class="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <label class="block text-sm text-gray-400" for="opt-fill">
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

            <!-- The footage effect first, because it is the loudest thing on
                 the picture and everything under it is a detail by comparison.
                 The switches follow, in groups that each name a subject. -->
            <div class="mt-5 border-t border-gray-800 pt-4">
              <span class="mb-2 block text-sm text-gray-400">Footage effect</span>
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
                      ...(config.effects ?? []).filter((e) => e.start != null || e.end != null),
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
                  <span class="mb-1.5 block text-xs tracking-wide text-gray-500 uppercase"
                    >{group.label}</span
                  >
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
              <span class="mb-1 block text-sm text-gray-400">Captions</span>
              <p class="mb-3 text-xs text-gray-500">
                What a caption does when it hasn't been given its own. Any caption can overrule all
                of this from its block.
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
                  onchange={(c) => patchConfig('the look', { colorizeCaption: true, logoColor: c })}
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

          <!-- The renderer's internals, one step further in.

               The same escalation the rest of this card is: four pictures, then
               the dials behind them, then the numbers behind those. It was a
               card of its own, which made "how the clip looks" two claims on the
               column when it is one subject. -->
          <section class="mt-6 border-t border-gray-800 pt-5">
            <button
              type="button"
              onclick={() => (showAdvanced = !showAdvanced)}
              class="flex w-full items-center justify-between text-left"
            >
              <div>
                <h3 class="text-sm font-medium text-gray-300">Advanced</h3>
                <p class="text-xs text-gray-500">
                  Frame rate, bitrate, loudness targets, caption maths, effect strengths
                  {#if changedAdvanced}
                    · <span class="text-violet-400">{changedAdvanced} changed from default</span>
                  {/if}
                </p>
              </div>
              <svg
                class="h-5 w-5 shrink-0 text-gray-500 transition-transform {showAdvanced
                  ? 'rotate-180'
                  : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {#if showAdvanced}
              <!-- No inset: this used to be a card, where the padding held its
                   contents off its own edge. Inside another card it just
                   stepped the fields in from everything above them. -->
              <div class="mt-4 space-y-6">
                <div class="flex flex-wrap items-center gap-4">
                  <div class="flex-1">
                    <label class={labelClass} for="adv-preset">Encoder speed</label>
                    <select
                      id="adv-preset"
                      class={fieldClass}
                      value={advanced.preset}
                      onchange={(e) => patchAdvanced({ preset: e.currentTarget.value as never })}
                    >
                      {#each ['ultrafast', 'veryfast', 'faster', 'fast', 'medium', 'slow'] as p (p)}
                        <option value={p}>{p}</option>
                      {/each}
                    </select>
                  </div>
                  <div class="flex-1">
                    <label class={labelClass} for="adv-font">Font family</label>
                    <input
                      id="adv-font"
                      class={fieldClass}
                      value={advanced.fontFamily}
                      placeholder="Auto (best available)"
                      onblur={(e) => patchAdvanced({ fontFamily: e.currentTarget.value })}
                    />
                  </div>
                  <div class="flex-1">
                    <label class={labelClass} for="adv-card-bg">Card background</label>
                    <input
                      id="adv-card-bg"
                      type="color"
                      class="h-10 w-full rounded-lg border border-gray-700 bg-gray-800"
                      value={advanced.cardBackground}
                      onchange={(e) => patchAdvanced({ cardBackground: e.currentTarget.value })}
                    />
                  </div>
                </div>

                {#each ADVANCED_GROUPS as group (group.label)}
                  <div>
                    <h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                      {group.label}
                    </h3>
                    <div
                      class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-3"
                    >
                      {#each group.fields as field (field.key)}
                        {@const isChanged =
                          advanced[field.key] !== DEFAULT_ADVANCED_CONFIG[field.key]}
                        <div>
                          <label class={labelClass} for="adv-{field.key}">
                            {field.label}
                            {#if isChanged}
                              <span class="text-violet-400">•</span>
                            {/if}
                          </label>
                          <input
                            id="adv-{field.key}"
                            type="number"
                            step={field.step ?? 1}
                            class={fieldClass}
                            value={savedAdvanced[field.key] as number}
                            oninput={(e) => {
                              const raw = e.currentTarget.value;
                              if (raw === '' || Number.isNaN(Number(raw))) return;
                              advancedDraft = { ...advancedDraft, [field.key]: Number(raw) };
                            }}
                            onblur={async (e) => {
                              const el = e.currentTarget;
                              const raw = el.value;
                              if (raw === '') return;
                              const ok = await patchAdvanced({ [field.key]: Number(raw) } as never);
                              if (!ok) return;
                              const { [field.key]: _saved, ...rest } = advancedDraft;
                              advancedDraft = rest;
                              /*
                               * The server has the last word on what this says.
                               *
                               * `value` is bound to the saved number, so a save
                               * that quietly kept the old one leaves the
                               * expression unchanged and the field goes on
                               * showing what you typed — which is how three
                               * dials missing from the save schema looked
                               * exactly like three dials that worked.
                               */
                              el.value = String(savedAdvanced[field.key]);
                            }}
                          />
                          {#if field.hint}
                            <p class="mt-1 text-xs text-gray-600">{field.hint}</p>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}

                <button
                  type="button"
                  onclick={resetAdvanced}
                  class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                >
                  Reset all to defaults
                </button>
              </div>
            {/if}
          </section>
        {/if}
      </SectionCard>

      <!-- What happens to the finished clip: where it stands, and the two ways
           it moves on. Nothing here exists until there is a render to act on.

           Down here rather than beside the player, which is now only the clip
           and the two buttons that make one. Releasing is the far end of the
           job and belongs at the far end of the column — and taking it out of
           the other pane is what gives the video its own shape back and the
           timeline the room to hold a lane per track. -->

      <!-- Last thing in the column, so it can't be reached for on the way to
           anything else. In the card header it forced an otherwise empty header
           row onto the card that names the clip, which cost more space than the
           button saves. -->
      <button
        onclick={() => (deleteConfirmOpen = true)}
        class="w-full rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-2.5 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete clip
      </button>
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

    {#if borrowed}
      <!-- One source, in the place the render usually sits.
           Keyed on the file so switching rows loads the new one, and on the
           in-point so marking a trim doesn't send the player back to zero — the
           fragment is what puts the playhead where the cut is. -->
      {@const from = borrowed.row.trimStart ?? 0}
      {@const turn = borrowed.row.rotation ?? 0}
      {@const quarter = turn === 90 || turn === 270}
      {#key `${borrowed.item.id}#${from}`}
        <div class="flex w-full items-center justify-center overflow-hidden rounded-lg bg-black">
          {#if borrowed.item.mimeType?.startsWith('image/')}
            <!-- A still has nothing to scrub. Its block on the strip is where
                 its length lives, so this is the picture and nothing else —
                 no transport bar promising a playhead that cannot move. -->
            <img
              src={borrowed.item.url}
              alt={borrowed.item.alt ?? borrowed.item.filename ?? ''}
              class="max-h-[60vh] {quarter ? 'max-w-[60vh]' : 'w-full'} object-contain"
              style="transform: rotate({turn}deg)"
            />
          {:else}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={sourceVideo}
              src="{borrowed.item.previewUrl ?? borrowed.item.url}#t={from}"
              controls
              preload="metadata"
              class="max-h-[60vh] {quarter ? 'max-w-[60vh]' : 'w-full'}"
              style="transform: rotate({turn}deg)"
            ></video>
          {/if}
        </div>
      {/key}
    {:else if shownMedia}
      <!-- The captions and branding go over a proof rather than into it, so
           retyping a line lands on the picture instead of costing a render. A
           full render has them burned in already, and drawing them twice would
           be worse than not drawing them at all. -->
      <!-- `overflow-hidden`, because a move is a transform on the video and a
           transform is not clipped by its parent unless the parent says so.
           Without it a push-in grew the picture out over the captions, the
           transport and the page — which read as the pan being broken rather
           than as the box being open. The overlays stay outside the transform
           on purpose: the render burns captions in after the look, so they do
           not travel with the picture there either. -->
      <div class="relative overflow-hidden rounded-lg">
        <!-- svelte-ignore a11y_media_has_caption -->
        <!-- Whatever is newest: the proof when there is one, the render
             otherwise. It played `outputMedia` regardless, so a fresh quick
             render was made, stored and then not shown — the pane kept the last
             full render while the note under it said "quick render". Invisible
             while a proof looked like a render; obvious the moment proofs
             stopped burning the captions in. -->
        <!-- The look goes on the video rather than into the proof, for the
             same reason the captions do: changing it should land instantly
             instead of costing a render. Only over a proof — a full render has
             it burned in already, and drawing it twice would be worse than not
             drawing it at all. -->
        <video
          bind:this={previewVideo}
          src={shownMedia.url}
          poster={shownMedia.thumbnailUrl ?? undefined}
          controls
          ontimeupdate={(e) => (previewAt = (e.currentTarget as HTMLVideoElement).currentTime)}
          onseeked={(e) => (previewAt = (e.currentTarget as HTMLVideoElement).currentTime)}
          onplay={() => (previewPlaying = true)}
          onpause={() => (previewPlaying = false)}
          onended={() => (previewPlaying = false)}
          class="w-full rounded-lg bg-black"
          style={showingProof ? lookStyle : undefined}
        ></video>
        {#if showingProof}
          <FootageLook svg={look.svg} overlay={look.overlay} />
          <ClipOverlay
            {captions}
            {config}
            adv={advanced}
            at={previewAt}
            graphic={stageGraphic('intro')?.thumbnailUrl || stageGraphic('intro')?.url || null}
            watermarkGraphic={stageGraphic('watermark')?.thumbnailUrl ||
              stageGraphic('watermark')?.url ||
              null}
            introSeconds={introShown}
            {accent}
          />
        {/if}
      </div>
    {:else if standIn}
      <!-- The shot itself, standing in for a render that doesn't exist yet.

           The proxy rather than the original: it is the same footage at a size
           that plays instantly, which is the whole reason it is made. Trimmed
           with a media fragment so the part you kept is the part that plays,
           though the browser honours that loosely — it is a preview of timing
           and look, not a frame-accurate one.

           What it cannot show is the frame: no aspect, no fill, no branding.
           Those are things the render composes, and this is one file played as
           it is, with the captions and the look drawn over it exactly as they
           are drawn over a proof. -->
      {#key standIn.item.id}
        <div class="relative overflow-hidden rounded-lg">
          {#if standIn.item.mimeType?.startsWith('image/')}
            <!-- The same stand-in for a still: the picture, with the look and
                 the captions drawn over it exactly as they are over a proof. -->
            <img
              src={standIn.item.url}
              alt={standIn.item.alt ?? standIn.item.filename ?? ''}
              class="w-full rounded-lg bg-black object-contain"
              style={lookStyle}
            />
          {:else}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={previewVideo}
              src="{standIn.url}#t={standIn.row.trimStart ?? 0}{standIn.row.trimEnd
                ? `,${standIn.row.trimEnd}`
                : ''}"
              controls
              ontimeupdate={(e) => (previewAt = (e.currentTarget as HTMLVideoElement).currentTime)}
              onseeked={(e) => (previewAt = (e.currentTarget as HTMLVideoElement).currentTime)}
              onplay={() => (previewPlaying = true)}
              onpause={() => (previewPlaying = false)}
              onended={() => (previewPlaying = false)}
              class="w-full rounded-lg bg-black"
              style={lookStyle}
            ></video>
          {/if}
          <FootageLook svg={look.svg} overlay={look.overlay} />
          <ClipOverlay
            {captions}
            {config}
            adv={advanced}
            at={previewAt}
            graphic={stageGraphic('intro')?.thumbnailUrl || stageGraphic('intro')?.url || null}
            watermarkGraphic={stageGraphic('watermark')?.thumbnailUrl ||
              stageGraphic('watermark')?.url ||
              null}
            introSeconds={introShown}
            {accent}
          />
        </div>
      {/key}
    {:else}
      <!-- Nothing rendered yet, so the box says so, in the same dashed
           treatment as the media drop zones. The button lives below it with
           every other render control. -->
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-700 px-8 py-16"
      >
        {#if isRendering}
          {@render renderProgress()}
        {:else}
          <p class="text-sm text-gray-500">Not rendered yet</p>
        {/if}
      </div>
    {/if}

    {#if selectedTrack}
      <!-- No panel, only a player.

           Everything a bed had a card for is on its block now: the waveform is
           drawn behind it, play and pause sit on it, and the fades and the duck
           are in its menu. What the block can't do is make a sound, so this is
           the element that does — kept out of sight, because a second scrubber
           under the render would only invite you to line the bed up against the
           wrong picture. -->
      <!-- Cued to where the bed actually comes in, the way the source player
           above is cued to a shot's in-point.
           The rail under a bed says which part of the song is used, and this
           element ignored it — so moving the rail and pressing play started at
           0:00 every time, which reads as the rail doing nothing. The render
           had it right all along; only the way you check it was wrong.
           Keyed on the cue point as well as the file, because a media element
           already holding a song does not re-seek when its `src` fragment
           changes — it has to be built again. -->
      {#key `${selectedTrack.mediaId}#${selectedTrack.seek ?? 0}`}
        <audio
          bind:this={bedAudio}
          src="{mediaById.get(selectedTrack.mediaId)?.url ?? ''}#t={selectedTrack.seek ?? 0}"
          preload="metadata"
          class="hidden"
        ></audio>
      {/key}
    {/if}

    <!-- Render, on its own directly under the preview: it acts on the video
         above it, and nothing else in this column does. -->
    {#if isRendering}
      <!-- The bar is the button.

           A progress bar, a percentage and a label sat in three stacked rows
           above a button that was the only thing you could do about any of it.
           Filling the control itself says the same and asks for one row: how
           far along, and the way to stop it, in the place you would reach for
           either. -->
      <button
        onclick={handleStop}
        class="relative w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm whitespace-nowrap text-gray-300 hover:border-red-800 hover:bg-red-950/40 hover:text-red-200"
      >
        <span
          class="absolute inset-y-0 left-0 bg-violet-600/35 transition-all duration-300"
          style="width: {job?.progress ?? 0}%"
        ></span>
        <span class="relative flex items-center justify-center gap-2">
          <span class="tabular-nums">
            {job?.status === 'queued' ? 'Queued…' : `Rendering ${job?.progress ?? 0}%`}
          </span>
          <span class="text-gray-500">·</span>
          <span>Cancel</span>
        </span>
      </button>
    {:else}
      <!-- Amber when the clip has moved on since this render, so the button
           itself says whether pressing it would produce anything different.
           Nothing subtler than a colour change would be noticed from across the
           page, and nothing louder is warranted — an out-of-date render is a
           normal state to be in while you work, not a problem. -->
      <!-- Two renders, because they answer different questions. Quick is for
           "is this in the right place" and takes seconds; the full one is for
           "is this finished" and is the only one anything downstream will
           touch. Amber on either when the clip has moved on since whatever
           you're looking at. -->
      <div class="flex gap-2">
        <!-- The switch, and then the doing. Which kind you are looking at and
             which kind you are about to make were two controls saying the same
             thing; now the left one chooses and the right one acts on it. -->
        <!-- A sunken track with a raised segment in it, rather than two
             buttons that happen to touch: the pair read as a choice already
             made, with no sense that pressing the other one was the gesture.
             The inset and the lift are what say "one of these two". -->
        <div
          class="flex shrink-0 items-stretch rounded-lg border border-gray-700 bg-gray-950/60 p-0.5 text-xs"
        >
          <button
            onclick={() => (watching = 'proof')}
            aria-pressed={watching === 'proof'}
            title="A rough, half-size render for judging placement — seconds rather than minutes"
            class="flex items-center rounded-md px-2.5 transition-colors {watching === 'proof'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'}"
          >
            Quick
          </button>
          <button
            onclick={() => (watching = 'final')}
            aria-pressed={watching === 'final'}
            title="The real one, full size — the only render anything downstream will touch"
            class="flex items-center rounded-md px-2.5 transition-colors {watching === 'final'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'}"
          >
            Final
          </button>
        </div>
        <button
          onclick={() => handleRender(watching === 'proof')}
          disabled={!data.renderingAvailable || sources.length === 0}
          title={stale ? 'This clip has changed since it was last rendered' : undefined}
          class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 {stale
            ? 'bg-amber-700 hover:bg-amber-600'
            : 'bg-sky-700 hover:bg-sky-600'}"
        >
          {#if stale}
            <span class="h-2 w-2 shrink-0 rounded-full bg-amber-200"></span>
          {/if}
          {#if watching === 'proof'}
            {proofMedia ? 'Render quick again' : 'Render quick'}
          {:else}
            {outputMedia ? 'Render again' : 'Render clip'}
          {/if}
        </button>
        <!-- The next thing you do to a finished clip, beside the button that
             finishes it. It had a full-width row of its own halfway down the
             left column, a long way from the video it is a verdict on. -->
        {#if canSendForReview}
          <button
            onclick={() => (reviewConfirmOpen = true)}
            title={selected.status === 'review' ? 'Send it again' : 'Send it for approval'}
            aria-label={selected.status === 'review' ? 'Re-send for review' : 'Send for review'}
            class="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-teal-700/60 bg-teal-900/30 px-3 py-2.5 text-sm whitespace-nowrap text-teal-200 transition-colors hover:bg-teal-900/50"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Review
          </button>
        {/if}
      </div>
    {/if}

    <!-- Under the buttons, not above them.

         A failure is the moment you most want to press Render again, and this
         sat between the video and that button pushing it down the column — the
         control moved exactly when it was needed. It stays a panel rather than
         a toast because it is a state, not an event: it is true until the next
         render, and a message that fades takes the reason with it. -->
    {#if job?.status === 'failed'}
      {@const detail = (job.error ?? '').trim()}
      <div class="rounded-lg border border-red-800/50 bg-red-950/40 p-3">
        <p class="text-sm font-medium text-red-300">Render failed</p>
        <!-- All of it, on sight.

             It was a headline, a summary and a "show details" — three rows to
             say one thing, and the summary was the least useful line ffmpeg
             prints: the exit code, which is 234 for nearly everything. What you
             want is the complaint underneath it, and this pane has the room to
             show it. Scrolls when it runs long rather than pushing the column
             about. -->
        <pre
          class="mt-1.5 max-h-32 overflow-auto text-[11px] leading-snug whitespace-pre-wrap text-red-200/70">{detail ||
            'No reason given'}</pre>
      </div>
    {/if}

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
    {#if outputMedia}
      <button
        onclick={() => (reviewOpen = true)}
        class="flex w-full items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-left transition-colors hover:border-gray-700"
      >
        <!-- One line for what you are looking at.

             A proof used to say so on its own row under the video, above a
             status line that said "Rendered" — two messages a few pixels apart,
             disagreeing. What is on screen is the more useful of the two, and
             where the clip has got to is behind the same door as everything
             else about that. -->
        <span
          class="h-2 w-2 shrink-0 rounded-full {showingProof
            ? 'bg-amber-400'
            : CLIP_STATUS_DOTS[selected.status]}"
        ></span>
        <span
          class="min-w-0 flex-1 truncate text-sm {showingProof
            ? 'text-amber-300/90'
            : 'text-gray-300'}"
        >
          {#if showingProof}
            Quick render — rough, for placing things
          {:else}
            {CLIP_STATUS_LABELS[selected.status] ?? selected.status}
          {/if}
        </span>
        <span class="shrink-0 text-xs text-gray-500">Details</span>
        <svg
          class="h-4 w-4 shrink-0 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    {/if}
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
      <ClipTimeline
        duration={layout.duration}
        clips={timelineClips}
        {captions}
        anchors={captionAnchors(advanced)}
        swatches={brandColors}
        onkeepcolor={keep}
        inheritedColor={captionColor({}, config, accent)}
        inheritedBackdrop={captionBackdrop({}, config)}
        inheritedEffect={config.captionEffect ?? null}
        effects={(config.effects ?? []).filter((e) => e.start != null || e.end != null)}
        wideEffect={clipWideEffect(config)}
        clipId={selected.id}
        oneffects={(placed) =>
          patchConfig('the effects', {
            /*
             * The lane owns the placed ones and the Look panel owns the
             * clip-wide one, so each writes back only its own half. Sending
             * the whole list from either would mean whichever was touched
             * last silently cleared the other.
             */
            effects: [
              ...(config.effects ?? []).filter((e) => e.start == null && e.end == null),
              ...placed
            ],
            pictureEffect: null
          })}
        oncaptions={setCaptions}
        selection={showing}
        {selectionPlaying}
        onmute={async (id, muted) => {
          await autosave.run('the mute', () => updateSource({ id, muted }));
          await invalidateAll();
        }}
        onfade={async (id, fades) => {
          await autosave.run('the fade', () => updateSource({ id, ...fades }));
          await invalidateAll();
        }}
        onremove={(kind, id) => (kind === 'clip' ? dropSource(id) : dropTrack(id))}
        oncaptionremove={deleteCaption}
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
        onpreview={(kind, id, play) => {
          const already = showing?.kind === kind && showing.id === id;

          // Pressing the same block again puts the render back. The way out
          // is the way in, so there's no button under the picture saying so —
          // and which block you're looking at is already said by the ring
          // around it. Play is exempt: that asks for sound, not for a
          // different thing on screen.
          if (already && !play) {
            openSourceId = null;
            openTrackId = null;
            return;
          }

          if (kind === 'clip') {
            openTrackId = null;
            openSourceId = id;
          } else {
            openSourceId = null;
            openTrackId = id;
          }
          if (play) {
            // Already showing, so its player exists and the press is a
            // toggle. Otherwise the selection is only now being made, and the
            // request is what the freshly mounted player picks up.
            if (already && activePlayer) {
              if (activePlayer.paused) void activePlayer.play().catch(() => {});
              else activePlayer.pause();
            } else {
              playRequest += 1;
            }
          }
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
        onaudio={async (id, { seekBy, ...changes }) => {
          // A head trim arrives as a shift, because only the row knows where
          // the song was already cued to.
          const track = seekBy ? data.audio.find((a) => a.id === id) : undefined;
          const cue = track ? { seek: Math.max(0, tidy((track.seek ?? 0) + seekBy!)) } : {};
          await autosave.run('the track', () => updateAudio({ id, ...changes, ...cue }));
          await invalidateAll();
        }}
        video={borrowed ? undefined : previewVideo}
        onfit={async (id, fit) => {
          await autosave.run('the framing', () => updateSource({ id, fit }));
          await invalidateAll();
        }}
        onframing={async (id, patch) => {
          await autosave.run('the framing', () => updateSource({ id, ...patch }));
          await invalidateAll();
        }}
        onscrubsource={(kind, id, seconds) => {
          // Only the one that's actually on screen. Everything else is
          // playing somewhere this page can't see.
          const player =
            kind === 'clip' && borrowed?.row.id === id
              ? sourceVideo
              : kind === 'audio' && selectedTrack?.id === id
                ? bedAudio
                : null;
          if (player) player.currentTime = Math.max(0, seconds);
        }}
      />
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

<!-- Post sheet dialog -->
<!-- Everything that happens to a clip after it is cut: where it stands, the
     verdict, where it went. Behind a door because none of it is read while you
     are cutting, and most of it is read once. -->
<!-- Asked before sending, because this is the one action here that leaves the
     machine: it fires a webhook and hands someone a link. Everything else in
     this editor is undone from a toast; a review is undone by explaining
     yourself to a person, and re-sending is another notification rather than a
     correction.

     It also has to say *what* is being sent, which is not necessarily what you
     are looking at — Review sends the full render, and you may well be watching
     a proof of an edit that render doesn't have yet. -->
<!-- A dialog rather than the browser's `confirm`, for the same reason Review
     has one: the sentence that matters is what goes with it, and a native
     prompt can't say that a rendered video and its posts go too. This one can
     also be dismissed the way every other dialog here is. -->
{#if deleteConfirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5">
      <h2 class="text-base font-semibold text-white">Delete this clip?</h2>
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
      <h2 class="text-base font-semibold text-white">
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
          class="rounded-lg border border-teal-700/60 bg-teal-900/40 px-3 py-2 text-sm text-teal-200 transition-colors hover:bg-teal-900/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selected.status === 'review' ? 'Send again' : 'Send for review'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if reviewOpen && outputMedia}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div
      class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-gray-700 bg-gray-900"
    >
      <div class="flex items-center justify-between border-b border-gray-700 p-4">
        <h2 class="font-semibold text-white">Status &amp; review</h2>
        <button
          onclick={() => (reviewOpen = false)}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
        >
          Close
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <!-- Where the clip stands, when that isn't already obvious.

             "Rendered" is the one status this card can't tell you anything by
             saying: there is a video above it and a button offering to make
             another, so it only ever restated the room it was standing in.
             Every other status is a thing that happened to the clip somewhere
             else — sent, approved, queued, live — and none of those are visible
             from here otherwise.

             The review strip below carries the decision; this only says what it
             is. Where it landed belongs with it — a release and its platforms
             are one fact, not two, so those rows sit here too. -->
        <div class="mb-3 flex items-center gap-2 text-sm">
          {#if selected.status !== 'rendered'}
            <span
              class="h-2 w-2 shrink-0 rounded-full {CLIP_STATUS_DOTS[selected.status] ??
                'bg-gray-500'}"
            ></span>
            <span class="text-gray-300">
              {CLIP_STATUS_LABELS[selected.status] ?? selected.status}
            </span>
          {/if}
          {#if stale}
            <span class="text-xs text-amber-400">Changed since this render</span>
          {/if}
          {#if outputMedia}
            <!-- A reference, not a step: you open it when you need to paste
                 something by hand, which is rare and never part of releasing. -->
            <button
              onclick={handlePostSheet}
              title="Post sheet — the caption, tags and link to paste when posting"
              aria-label="View post sheet"
              class="ml-auto shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          {/if}
        </div>

        <!-- Reported back by the publishing workflow, so this stays empty
             until something calls the callback: "published" on its own only
             means the webhook was accepted. -->
        {#if data.posts.length > 0}
          <ul class="mb-4 space-y-1.5">
            {#each data.posts as post (post.id)}
              <li class="flex items-center gap-2 text-xs">
                <span
                  class="rounded px-1.5 py-0.5 font-medium {post.status === 'live'
                    ? 'bg-emerald-900 text-emerald-300'
                    : post.status === 'draft'
                      ? 'bg-amber-900 text-amber-300'
                      : 'bg-red-900 text-red-300'}"
                >
                  {post.status === 'live' ? 'Live' : post.status === 'draft' ? 'Draft' : 'Failed'}
                </span>
                <span class="text-gray-300">{PLATFORM_NAMES[post.platform] ?? post.platform}</span>
                {#if post.status === 'draft'}
                  <span class="text-gray-500">uploaded, post it by hand</span>
                {/if}
                {#if post.url}
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    class="truncate text-violet-400 hover:text-violet-300">View post</a
                  >
                {/if}
                {#if post.error}
                  <!-- Quoted, not phrased as our own verdict: the workflow owns
                       this string, and it sends unhelpful ones. A bare "ok" in
                       red beside "Failed" reads as a contradiction rather than
                       as the message TikTok handed back. -->
                  <span class="truncate text-gray-500" title={post.error}>
                    said “{post.error}”
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        <!-- Violet, from the status ladder: the colour of the queue this puts
             the clip into. Only shown once there's something to release. -->
        {#if canSchedule}
          <button
            onclick={() => (queueDialogOpen = true)}
            class="w-full rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500"
          >
            Schedule release
          </button>
        {/if}

        {#if selected.reviewNote}
          <p class="mb-4 rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-400">
            <span class="text-gray-500">Note:</span>
            {selected.reviewNote}
          </p>
        {/if}

        <!-- Shown whenever a token exists rather than revealed by a menu: the
             link is a property of the clip, and copying it is the common act.
             The actions sit inside the field so the whole thing reads as one
             object — this is the share, and these are the things you do to it. -->
        {#if selected.previewToken}
          <div class="mt-3 flex items-center gap-1 rounded-lg bg-gray-950 py-1 pr-1 pl-3">
            <a
              href="/preview/{selected.previewToken}"
              target="_blank"
              rel="noreferrer"
              class="min-w-0 flex-1 truncate py-1 text-xs text-violet-400 hover:text-violet-300"
            >
              /preview/{selected.previewToken}
            </a>
            {@render linkAction(
              () => handlePreviewLink(false),
              'Copy preview link',
              'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
            )}
            {@render linkAction(
              () => handlePreviewLink(true),
              'Invalidate this link and create a new one',
              'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
            )}
            {#if outputMedia}
              <a
                href={outputMedia.url}
                download
                title="Download video"
                aria-label="Download video"
                class="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </a>
            {/if}
          </div>
        {/if}

        {#if selected.status === 'queued'}
          <div class="flex flex-wrap items-end gap-3 border-t border-gray-800 pt-4">
            <!-- Reads as a statement, not a control. Changing it reopens the
                   same dialog that set it, so there's one place that answers
                   "when does this go out" rather than a field to hunt for. -->
            <div>
              <span class={labelClass}>Release</span>
              <p class="flex items-center gap-2 py-1.5 text-xs text-gray-300">
                {selected.scheduledFor
                  ? new Intl.DateTimeFormat(data.settings?.locale ?? 'nb-NO', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      hour12: false
                    }).format(new Date(selected.scheduledFor))
                  : 'Next available slot'}
                <button
                  onclick={() => (queueDialogOpen = true)}
                  class="whitespace-nowrap text-violet-400 hover:text-violet-300"
                >
                  Change
                </button>
              </p>
            </div>
            {#if !selected.scheduledFor}
              <div>
                <label class={labelClass} for="gap">Gap before next (days)</label>
                <input
                  id="gap"
                  type="number"
                  min="0"
                  step="1"
                  class={numberClass + ' w-32'}
                  value={selected.queueGapDays ?? ''}
                  placeholder="default"
                  onblur={async (e) => {
                    const raw = e.currentTarget.value;
                    await autosave.run('the queue gap', () =>
                      setQueueGap({
                        projectId: selected.id,
                        days: raw === '' ? null : Number(raw)
                      })
                    );
                    await invalidateAll();
                  }}
                />
              </div>
            {/if}
            <button
              onclick={handleUnqueue}
              class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 hover:bg-gray-700"
            >
              Remove from queue
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if postSheet}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900">
      <div class="flex items-center justify-between border-b border-gray-700 p-4">
        <h2 class="font-semibold text-white">Post sheet</h2>
        <div class="flex gap-2">
          <button
            onclick={copyPostSheet}
            class="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500"
          >
            Copy
          </button>
          <button
            onclick={() => (postSheet = null)}
            class="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300"
          >
            Close
          </button>
        </div>
      </div>
      <pre
        class="max-h-[60vh] overflow-auto p-4 text-xs whitespace-pre-wrap text-gray-300">{postSheet.markdown}</pre>
    </div>
  </div>
{/if}
