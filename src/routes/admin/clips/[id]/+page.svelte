<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import MediaPicker from '$lib/components/ui/MediaPicker.svelte';
  import {
    EmojiPicker,
    ImageSelect,
    LengthMeter,
    SaveStatus,
    SortableList,
    TagInput,
    TimeField,
    ToggleSwitch
  } from '$lib/components/ui';
  import { Autosave } from '$lib/utils/autosave.svelte';
  import { renderFingerprint } from '$lib/clips/fingerprint';
  import {
    AudioTrackControls,
    ClipTimeline,
    SourceClipControls,
    type TimelineTrack
  } from '$lib/components/clips';
  import { SectionCard } from '$lib/components/cards';
  import { EditorPreview } from '$lib/components/ui';
  import { PhoneUploadDialog, QueueClipDialog } from '$lib/components/dialogs';
  import { formatDuration } from '$lib/utils/upload';
  import { fieldClass, labelClass, numberClass } from '$lib/utils/classes';
  import { insertAtCursor } from '$lib/utils/text';
  import {
    DEFAULT_CLIP_CONFIG,
    DEFAULT_ADVANCED_CONFIG,
    ADVANCED_GROUPS,
    CLIP_PRESETS,
    CLIP_STATUS_LABELS,
    CLIP_STATUS_DOTS,
    PLATFORM_NAMES,
    type ClipRotation,
    type ClipRenderConfig,
    type ClipAdvancedConfig,
    type TimedCaption
  } from '$lib/clips/types';
  import type { PageData } from './$types';
  import {
    updateProject,
    saveClipDefaultTags,
    saveClipDefaultDescription,
    deleteProject,
    addSource,
    updateSource,
    removeSource,
    addAudio,
    updateAudio,
    removeAudio,
    reorderAudio,
    restoreSource,
    restoreAudio,
    reorderSources,
    startRender,
    stopRender,
    getRenderStatus,
    getPostSheet,
    sendForReview,
    reviewDecision,
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
  const tracks = $derived<TimelineTrack[]>(
    data.audio.map((row) => ({
      id: row.id,
      mediaId: row.mediaId,
      // Resolved once, here, because both the list and the timeline want to
      // write the track's name and neither should be looking it up itself.
      label: mediaById.get(row.mediaId)?.filename ?? 'Missing track',
      start: row.start ?? 0,
      end: row.end ?? null,
      seek: row.seek ?? 0,
      fadeIn: row.fadeIn ?? true,
      fadeOut: row.fadeOut ?? true,
      duck: row.duck ?? false
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
  const stale = $derived.by(() => {
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

  /**
   * One forward action per stage. Review is only meaningful before a clip is
   * approved — offering it on something already queued or published invited
   * sending a released clip back for approval, which means nothing.
   */
  const canSendForReview = $derived(!['approved', 'queued', 'published'].includes(selected.status));
  const canSchedule = $derived(selected.status === 'approved');
  const outputMedia = $derived(
    selected.outputMediaId ? mediaById.get(selected.outputMediaId) : undefined
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

  async function handleDelete(id: number) {
    if (!confirm('Delete this clip and its rendered video? This cannot be undone.')) return;
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
  }

  async function patchConfig(what: string, changes: Partial<ClipRenderConfig>) {
    await patch(what, { config: changes });
  }

  // Advanced dials are merged server-side, so sending one field leaves the rest
  // untouched.
  async function patchAdvanced(changes: Partial<ClipAdvancedConfig>) {
    await patch('the advanced settings', { config: { advanced: changes } });
  }

  const advanced = $derived<ClipAdvancedConfig>({
    ...DEFAULT_ADVANCED_CONFIG,
    ...(config.advanced ?? {})
  });

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
   */
  const LOOK_OPTIONS: { key: keyof ClipRenderConfig; label: string; hint: string }[] = [
    {
      key: 'colorizeCaption',
      label: 'Caption in brand colour',
      hint: "Captions take the graphics variant's accent colour instead of white."
    },
    {
      key: 'captionBackground',
      label: 'Caption backdrop',
      hint: 'Sit captions on a dark panel instead of outlining them. Helps over busy footage.'
    },
    { key: 'grain', label: 'Film grain', hint: 'Adds texture over the footage.' },
    { key: 'vignette', label: 'Vignette', hint: 'Darkens the corners.' },
    { key: 'zoom', label: 'Slow zoom', hint: 'A slow push in across each clip.' },
    {
      key: 'xfade',
      label: 'Crossfade clips',
      hint: 'Dissolve between sources instead of cutting.'
    },
    { key: 'videoFadeOut', label: 'Video fade out', hint: 'Fade the picture out at the end.' },
    { key: 'audioFadeIn', label: 'Sound fade in', hint: 'Fade the audio up at the start.' },
    { key: 'audioFadeOut', label: 'Sound fade out', hint: 'Fade the audio down at the end.' },
    {
      key: 'loudnorm',
      label: 'Normalise loudness',
      hint: 'Match the -14 LUFS level every platform normalises to anyway.'
    }
  ];

  /** Branding elements, shown under Look — they're part of the clip's look. */
  const BRANDING_OPTIONS: { key: keyof ClipRenderConfig; label: string; hint: string }[] = [
    { key: 'intro', label: 'Intro', hint: 'The graphic animates in over the opening.' },
    { key: 'watermark', label: 'Watermark', hint: 'A small corner mark for the whole clip.' },
    {
      key: 'outro',
      label: 'Outro',
      hint: 'Dissolve out to a card showing the graphic at the end.'
    }
  ];

  let showCustomise = $state(false);

  /**
   * The preset whose every named option currently matches the config, if any.
   *
   * A preset only sets the options it names, so this compares just those —
   * checking the whole config would never match once you'd touched anything
   * a preset leaves alone, like aspect or music.
   */
  const activePreset = $derived(
    CLIP_PRESETS.find((preset) =>
      (Object.keys(preset.config) as (keyof ClipRenderConfig)[]).every(
        (key) => config[key] === preset.config[key]
      )
    )?.id ?? null
  );

  async function applyPreset(presetId: string) {
    const preset = CLIP_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    await patchConfig('the preset', preset.config);
    toast.success(`${preset.label} applied`);
  }

  async function resetAdvanced() {
    if (!confirm('Reset every advanced dial to its default?')) return;
    await patchAdvanced({ ...DEFAULT_ADVANCED_CONFIG });
    toast.success('Advanced settings reset');
  }

  /**
   * Appends the picked clips in the order they were selected. Sequential
   * because addSource derives each new position from the current highest, so
   * firing them at once would race and collapse the ordering.
   */
  /**
   * Files the picked media by what each file is: footage into Clips, music into
   * Audio. Anything else — a stray image — is skipped rather than filed
   * somewhere it would only be confusing.
   *
   * Sequential because both inserts derive a position from the current highest,
   * so firing them at once would race and collapse the ordering.
   */
  async function handleAddMedia(ids: number[]) {
    if (!selected || ids.length === 0) return;

    const picked = ids
      .map((id) => data.media.find((m) => m.id === id))
      .filter((m): m is (typeof data.media)[number] => Boolean(m));

    const videos = picked.filter((m) => m.mimeType?.startsWith('video/'));
    const audios = picked.filter((m) => m.mimeType?.startsWith('audio/'));
    if (videos.length === 0 && audios.length === 0) return;

    // One unit of work, not one per file: a run that stops halfway has still
    // added something, and retrying the whole picking is what you'd want.
    const added = await autosave.run('the media', async () => {
      for (const item of videos) {
        await addSource({ projectId: selected.id, mediaId: item.id });
      }
      for (const item of audios) {
        await addAudio({ projectId: selected.id, mediaId: item.id });
      }
    });
    await invalidateAll();

    if (added !== undefined) {
      const parts = [
        videos.length ? `${videos.length} clip${videos.length > 1 ? 's' : ''}` : null,
        audios.length ? `${audios.length} track${audios.length > 1 ? 's' : ''}` : null
      ].filter(Boolean);
      toast.success(`Added ${parts.join(' and ')}`);
    }
  }

  const graphicOptions = $derived([
    { value: '', label: 'Site default', hint: 'Whatever is set as default in Media' },
    ...data.graphics.map((g) => ({
      value: String(g.id),
      label: g.filename.replace(/\.[^.]+$/, ''),
      image: g.thumbnailUrl || g.url
    })),
    { value: 'random', label: 'Random', hint: 'A different one each render' }
  ]);

  /** The graphic a clip will actually render with, for the summary line. */
  const activeGraphic = $derived(
    config.randomGraphics
      ? null
      : (data.graphics.find(
          (g) => g.id === (config.graphicMediaId ?? data.defaultGraphicMediaId)
        ) ?? null)
  );

  /** SortableList hands back the whole list already in its new order. */
  async function handleReorderSources(reordered: typeof sources) {
    await autosave.run('the clip order', () =>
      reorderSources({
        projectId: selected.id,
        orderedIds: reordered.map((s) => s.id)
      })
    );
    // Reloaded either way: a refused reorder leaves the list showing an order
    // the server never took, and the honest thing is to put it back.
    await invalidateAll();
  }

  async function handleReorderAudio(reordered: typeof tracks) {
    await autosave.run('the track order', () =>
      reorderAudio({ projectId: selected.id, orderedIds: reordered.map((t) => t.id) })
    );
    // Reloaded either way: a refused reorder leaves the list showing an order
    // the server never took, and the honest thing is to put it back.
    await invalidateAll();
  }

  async function handleRender() {
    const result = await attempt('Could not start the render', () => startRender(selected.id));
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

  async function handleSendForReview() {
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

  async function handleDecision(approved: boolean) {
    const note = approved ? null : prompt('Why is it rejected? (optional)');
    const decided = await attempt('Could not record the decision', () =>
      reviewDecision({ projectId: selected.id, approved, note })
    );
    if (decided === undefined) return;
    await invalidateAll();
    toast.success(approved ? 'Approved' : 'Rejected');
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

  async function addCaption() {
    const last = captions[captions.length - 1];
    const start = last ? last.end : 0;
    await setCaptions([...captions, { start, end: start + 4, text: '' }]);
  }

  async function updateCaption(index: number, changes: Partial<TimedCaption>) {
    await setCaptions(captions.map((c, i) => (i === index ? { ...c, ...changes } : c)));
  }

  async function deleteCaption(index: number) {
    // The whole list, not the removed line: putting one back where it was is
    // the same operation as never having taken it out, and the array is small.
    const before = captions;
    await setCaptions(captions.filter((_, i) => i !== index));
    toast.undoable('Caption removed', () => setCaptions(before));
  }
</script>

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

{#snippet removeButton(onclick: () => void, label: string)}
  <button
    {onclick}
    aria-label={label}
    title={label}
    class="shrink-0 px-2 text-xs text-red-400 hover:text-red-300">✕</button
  >
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
              rows="3"
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
      <SectionCard title="Branding">
        {#snippet actions()}
          <!-- What it will actually render with, which is the one thing you
               would open this card to check. -->
          <span class="text-xs text-gray-500">
            {#if config.randomGraphics}
              Random of {data.graphics.length}
            {:else if activeGraphic}
              {activeGraphic.filename}
            {/if}
          </span>
        {/snippet}

        <!-- Graphic and placements on one row: which mark, and where it lands,
             is a single decision in practice. The toggles stay available with no
             graphic designated — they're what says whether these stages run at
             all, so hiding them made the setting unreachable. -->
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          {#if data.graphics.length > 0}
            <div class="w-48 shrink-0">
              <ImageSelect
                value={config.randomGraphics ? 'random' : String(config.graphicMediaId ?? '')}
                options={graphicOptions}
                onchange={(v) =>
                  patchConfig(
                    'the branding',
                    v === 'random'
                      ? { randomGraphics: true }
                      : { randomGraphics: false, graphicMediaId: v === '' ? null : Number(v) }
                  )}
              />
            </div>
          {/if}

          {#each BRANDING_OPTIONS as option (option.key)}
            <label class="flex items-center gap-2 text-sm text-gray-300" title={option.hint}>
              <input
                type="checkbox"
                checked={config[option.key] as boolean}
                onchange={(e) =>
                  patchConfig('the branding', { [option.key]: e.currentTarget.checked } as never)}
                class="rounded border-gray-600 bg-gray-700 text-violet-500"
              />
              {option.label}
            </label>
          {/each}
        </div>

        {#if data.graphics.length === 0}
          <p class="mt-3 text-sm text-gray-500">
            No clip graphics designated, so these render without a mark. Add some in
            <a href="/admin/media" class="text-violet-400 hover:text-violet-300">Media</a>.
          </p>
        {/if}
      </SectionCard>

      <!-- Adding, once, for both lists.
           A file knows what it is, so asking which section it belongs in was
           asking the person to do the sorting: footage into Clips, music into
           Audio, and the same two buttons whichever you have in your hand. The
           phone QR takes both too — the server files an arriving upload the
           same way.

           Full width, splitting the row between them. At their own size they
           sat in the gap between two cards belonging to neither and read as
           debris; spanning the column they line up with everything else in it
           and become the thing you do before the lists below. -->
      <div class="flex flex-wrap gap-2">
        <button
          onclick={() => (mediaPickerOpen = true)}
          title="Footage lands in Clips, music in Audio"
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

      <!-- Clips -->
      <SectionCard title="Clips">
        {#if sources.length === 0}
          <p class="text-sm text-gray-500">No clips yet. They render in the order listed here.</p>
        {:else}
          <!-- Rows, not tiles. This is the ingredient list — what is in the
               clip and in what order — and the arranging happens on the
               timeline further down. A row states an order without restating
               it every time the column changes width, and it stays short
               enough that the sections below it are still on the screen. -->
          <SortableList items={sources} onreorder={handleReorderSources}>
            {#snippet children(source)}
              {@const item = mediaById.get(source.mediaId)}
              <!-- The background sits on the wrapper, not the header, so an
                   open row and the controls it opened are one shape rather than
                   a card with another card under it. -->
              <div
                class="group overflow-hidden rounded-lg bg-gray-800/50 transition-colors hover:bg-gray-800"
              >
                <div class="flex items-center gap-3 px-3 py-2">
                  <!-- The handle rides on the thumbnail rather than beside it.
                     A drag affordance needs somewhere to grab, not a column of
                     its own — and on a narrow row that column was the trim
                     fields' space.

                     Always visible, never revealed on hover: a phone has no
                     hover, so a handle that waits for one can't be found at all
                     on the screen where the saved space actually matters. -->
                  <div class="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-gray-800">
                    {#if item?.thumbnailUrl}
                      <img src={item.thumbnailUrl} alt="" class="h-full w-full object-cover" />
                    {/if}
                    <div
                      data-drag-handle
                      aria-label="Drag to reorder"
                      class="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/60 py-1 text-white/80 transition-colors group-hover:bg-black/80 group-hover:text-white"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 8h16M4 16h16"
                        />
                      </svg>
                    </div>
                  </div>

                  <!-- The row opens trim, mute and rotate, and used to say so
                     only in a title — a tooltip, on the one control here you'd
                     never guess at, unreachable on the phone this list is
                     designed for. The scissors carry it instead: always drawn,
                     never revealed on hover, for the same reason the drag
                     handle above is. -->
                  <button
                    onclick={() => (openSourceId = openSourceId === source.id ? null : source.id)}
                    class="group/trim flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={openSourceId === source.id}
                    title="Trim, mute and turn"
                  >
                    <span class="min-w-0 flex-1">
                      <span
                        class="block truncate text-sm text-white group-hover/trim:text-violet-300"
                      >
                        {item?.filename ?? 'Missing file'}
                      </span>
                      <span class="block text-xs text-gray-500">
                        {formatDuration(item?.durationMs)}
                        {#if source.trimStart != null || source.trimEnd != null}
                          · trimmed
                        {/if}
                        {#if source.muted}
                          · muted
                        {/if}
                        {#if source.rotation}
                          · turned {source.rotation}°
                        {/if}
                      </span>
                    </span>
                    <svg
                      class="h-4 w-4 shrink-0 text-gray-600 transition-colors group-hover/trim:text-violet-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                      />
                    </svg>
                  </button>

                  {@render removeButton(async () => {
                    // Captured before it goes: after the reload there is nothing
                    // left to describe what was removed.
                    const gone = { ...source };
                    const done = await autosave.run('the removed clip', () =>
                      removeSource(source.id)
                    );
                    await invalidateAll();
                    if (done === undefined) return;
                    toast.undoable('Clip removed', async () => {
                      await autosave.run('the restored clip', () => restoreSource(gone));
                      await invalidateAll();
                    });
                  }, 'Remove source clip')}
                </div>

                {#if openSourceId === source.id}
                  <SourceClipControls
                    src={item?.url ?? null}
                    trimStart={source.trimStart}
                    trimEnd={source.trimEnd}
                    muted={source.muted ?? false}
                    rotation={(source.rotation ?? 0) as ClipRotation}
                    onchange={async (values) => {
                      await autosave.run('the clip', () =>
                        updateSource({ id: source.id, ...values })
                      );
                      await invalidateAll();
                    }}
                  />
                {/if}
              </div>
            {/snippet}
          </SortableList>
        {/if}
      </SectionCard>

      <SectionCard title="Audio">
        {#snippet actions()}
          <!-- Beside the heading because it is about the section, not about any
               track in it: it drops the footage audio from the mix entirely and
               lets the beds play at full instead of sitting back under it. With
               two beds that question is asked once, and up here it costs no
               row. -->
          {#if tracks.length > 0}
            <ToggleSwitch
              label="Replace clip audio"
              size="md"
              checked={config.musicOnly}
              onchange={(musicOnly) => patchConfig('the audio', { musicOnly })}
            />
          {/if}
        {/snippet}

        {#if tracks.length === 0}
          <p class="text-sm text-gray-500">No audio. The clips' own sound is used as-is.</p>
        {:else}
          <SortableList items={tracks} onreorder={handleReorderAudio}>
            {#snippet children(track)}
              {@const marks = [
                `${track.start}s–${track.end ?? 'end'}`,
                track.seek ? `from ${track.seek}s` : null,
                track.duck ? 'ducked' : null
              ].filter(Boolean)}
              <!-- The same row as a source clip, down to where the handle sits:
                   these are both lists of things a clip is made of, and reading
                   as two different kinds of list would be the only difference
                   between them. -->
              <div
                class="group overflow-hidden rounded-lg bg-gray-800/50 transition-colors hover:bg-gray-800"
              >
                <div class="flex items-center gap-3 px-3 py-2">
                  <div
                    data-drag-handle
                    aria-label="Drag to reorder"
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-800 text-gray-500 transition-colors group-hover:text-white"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>

                  <button
                    onclick={() => (openTrackId = openTrackId === track.id ? null : track.id)}
                    class="group/track flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={openTrackId === track.id}
                    title="When it comes in, and how it sits against the footage"
                  >
                    <span class="min-w-0 flex-1">
                      <span
                        class="block truncate text-sm text-white group-hover/track:text-violet-300"
                      >
                        {track.label}
                      </span>
                      <span class="block truncate text-xs text-gray-500" title={marks.join(' · ')}>
                        {marks.join(' · ')}
                      </span>
                    </span>
                    <!-- Sliders rather than scissors: this row opens settings,
                       where a source row opens an edit. -->
                    <svg
                      class="h-4 w-4 shrink-0 text-gray-600 transition-colors group-hover/track:text-violet-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                      />
                    </svg>
                  </button>

                  {@render removeButton(async () => {
                    // The stored row rather than the normalised one the list
                    // draws from: restoring has to put back what was there,
                    // nulls and all, not the defaults filled in over them.
                    const gone = data.audio.find((a) => a.id === track.id);
                    const done = await autosave.run('the removed track', () =>
                      removeAudio(track.id)
                    );
                    await invalidateAll();
                    if (done === undefined || !gone) return;
                    toast.undoable('Track removed', async () => {
                      await autosave.run('the restored track', () => restoreAudio(gone));
                      await invalidateAll();
                    });
                  }, 'Remove this track')}
                </div>

                {#if openTrackId === track.id}
                  <AudioTrackControls
                    src={mediaById.get(track.mediaId)?.url ?? null}
                    clipVideo={previewVideo}
                    start={track.start}
                    end={track.end}
                    seek={track.seek}
                    fadeIn={track.fadeIn}
                    fadeOut={track.fadeOut}
                    duck={track.duck}
                    onchange={async (values) => {
                      await autosave.run('the track', () =>
                        updateAudio({ id: track.id, ...values })
                      );
                      await invalidateAll();
                    }}
                  />
                {/if}
              </div>
            {/snippet}
          </SortableList>
        {/if}
      </SectionCard>

      <!-- Captions -->
      <SectionCard title="Captions">
        {#snippet actions()}
          <button
            onclick={addCaption}
            class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 hover:bg-gray-700"
          >
            Add line
          </button>
        {/snippet}
        {#if captions.length === 0}
          <p class="text-sm text-gray-500">
            No captions, so the clip renders without on-video text.
          </p>
        {:else}
          <ul class="space-y-2">
            {#each captions as caption, index (index)}
              <li class="flex flex-wrap items-center gap-2">
                <TimeField
                  value={caption.start}
                  onchange={(start) => updateCaption(index, { start: start ?? 0 })}
                  label="Start seconds"
                  media={previewVideo}
                  unavailable="Render the clip once, then mark caption times against it"
                />
                <span class="text-gray-600">–</span>
                <TimeField
                  value={caption.end}
                  onchange={(end) => updateCaption(index, { end: end ?? 0 })}
                  label="End seconds"
                  media={previewVideo}
                  unavailable="Render the clip once, then mark caption times against it"
                />
                <input
                  value={caption.text}
                  onblur={(e) => updateCaption(index, { text: e.currentTarget.value })}
                  placeholder="Caption text"
                  class={fieldClass + ' flex-1'}
                />
                <ToggleSwitch
                  label="Big"
                  size="md"
                  checked={caption.headline ?? false}
                  onchange={(headline) => updateCaption(index, { headline })}
                />
                {@render removeButton(() => deleteCaption(index), 'Remove caption')}
              </li>
            {/each}
          </ul>
          <!-- Said out loud rather than left to the buttons' tooltips: the
               marks are disabled until there's a render to mark against, and a
               tooltip explaining that can't be reached on a phone at all. -->
          <p class="mt-3 text-xs text-gray-600">
            {#if outputMedia}
              Mark a time from the player, or drag them about on the timeline below.
            {:else}
              Render once, then mark these against the video instead of counting seconds.
            {/if}
          </p>
        {/if}
      </SectionCard>

      <!-- Music -->
      <!-- Look -->
      <SectionCard title="Look">
        <!-- The templates and nothing else. Each one is a still of this clip's
             own footage with that grade on it, which is the whole decision for
             most clips and the only part of it worth showing unprompted.

             The frame moved in behind Customise with the rest. It is genuinely
             not a look — it depends on what you shot, not the mood you want —
             but it is also 9:16 for every clip this studio exists to make, so
             standing at the front it was a question nobody needed to answer. -->
        <!-- Two presets per row even on the narrowest phone: they're compared
             against each other, and one per row makes that a scroll. -->
        <div
          class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,7.5rem),1fr))] gap-3"
        >
          {#each CLIP_PRESETS as preset (preset.id)}
            <button
              type="button"
              onclick={() => applyPreset(preset.id)}
              title={preset.description}
              class="group overflow-hidden rounded-lg border text-left transition-colors {activePreset ===
              preset.id
                ? 'border-violet-500'
                : 'border-gray-700 hover:border-gray-500'}"
            >
              <div class="aspect-[4/3] overflow-hidden bg-gray-950">
                {#if sources.length}
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
        </div>

        <button
          type="button"
          onclick={() => (showCustomise = !showCustomise)}
          class="mt-4 flex w-full items-center justify-between border-t border-gray-800 pt-4 text-left"
        >
          <span class="text-xs text-gray-400">
            Customise
            {#if !activePreset}
              · <span class="text-violet-400">Custom</span>
            {/if}
          </span>
          <svg
            class="h-4 w-4 shrink-0 text-gray-500 transition-transform {showCustomise
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

        {#if showCustomise}
          <div class="mt-4 space-y-4">
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
              <div>
                <label class={labelClass} for="opt-tone">Tone</label>
                <select
                  id="opt-tone"
                  class={fieldClass}
                  value={config.tone}
                  onchange={(e) =>
                    patchConfig('the look', { tone: e.currentTarget.value as never })}
                >
                  <option value="none">None</option>
                  <option value="bw">Black &amp; white</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                  <option value="vintage">Vintage</option>
                </select>
              </div>
              <div>
                <label class={labelClass} for="opt-cappos">Caption position</label>
                <select
                  id="opt-cappos"
                  class={fieldClass}
                  value={config.captionPosition}
                  onchange={(e) =>
                    patchConfig('the look', { captionPosition: e.currentTarget.value as never })}
                >
                  <option value="bottom">Bottom</option>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                </select>
              </div>
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

            <div
              class="mt-4 grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2"
            >
              {#each LOOK_OPTIONS as option (option.key)}
                <label class="flex items-center gap-2 text-sm text-gray-300" title={option.hint}>
                  <input
                    type="checkbox"
                    checked={config[option.key] as boolean}
                    onchange={(e) =>
                      patchConfig('the look', { [option.key]: e.currentTarget.checked } as never)}
                    class="rounded border-gray-600 bg-gray-700 text-violet-500"
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </SectionCard>

      <!-- Advanced: the renderer's internals, collapsed by default -->
      <section class="rounded-xl border border-gray-800 bg-gray-900">
        <button
          type="button"
          onclick={() => (showAdvanced = !showAdvanced)}
          class="flex w-full items-center justify-between p-5 text-left"
        >
          <div>
            <h2 class="font-semibold text-white">Advanced</h2>
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
          <div class="space-y-6 border-t border-gray-800 p-5">
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
                    {@const isChanged = advanced[field.key] !== DEFAULT_ADVANCED_CONFIG[field.key]}
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
                        value={advanced[field.key] as number}
                        onblur={(e) => {
                          const raw = e.currentTarget.value;
                          if (raw === '') return;
                          patchAdvanced({ [field.key]: Number(raw) } as never);
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

      <!-- Last thing in the column, so it can't be hit on the way to anything
           else. Full width to read as the end of the page rather than an
           action competing with the ones in the cards above. -->
      <button
        onclick={() => handleDelete(selected.id)}
        class="w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete clip
      </button>
    </div>
  {/snippet}

  <!-- The render and what happens to it. On a phone this is the Preview half,
       so the video and the buttons that act on it arrive together — no scrolling
       past the whole settings column to see what you just rendered. -->
  {#snippet preview()}
    <!-- The clip itself, or the invitation to make one. Progress lives here
         rather than in the Render box: it describes the clip taking shape, and
         showing it in both places said the same thing twice. -->
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

    {#if outputMedia}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={previewVideo}
        src={outputMedia.url}
        poster={outputMedia.thumbnailUrl ?? undefined}
        controls
        class="w-full rounded-lg bg-black"
      ></video>
      {#if isRendering}
        {@render renderProgress()}
      {/if}
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

    <!-- Render, on its own directly under the preview: it acts on the video
         above it, and nothing else in this column does. -->
    {#if job?.status === 'failed'}
      <div class="rounded-lg border border-red-800/50 bg-red-950/40 p-3">
        <p class="text-sm font-medium text-red-300">Render failed</p>
        <pre
          class="mt-2 max-h-40 overflow-auto text-xs whitespace-pre-wrap text-red-200/70">{job.error}</pre>
      </div>
    {/if}

    {#if isRendering}
      <button
        onclick={handleStop}
        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-base whitespace-nowrap text-gray-300 hover:bg-gray-700"
      >
        Cancel render
      </button>
    {:else}
      <!-- Amber when the clip has moved on since this render, so the button
           itself says whether pressing it would produce anything different.
           Nothing subtler than a colour change would be noticed from across the
           page, and nothing louder is warranted — an out-of-date render is a
           normal state to be in while you work, not a problem. -->
      <button
        onclick={handleRender}
        disabled={!data.renderingAvailable || sources.length === 0}
        title={stale ? 'This clip has changed since it was last rendered' : undefined}
        class="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-medium whitespace-nowrap text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 {stale
          ? 'bg-amber-700 hover:bg-amber-600'
          : 'bg-sky-700 hover:bg-sky-600'}"
      >
        {#if stale}
          <span class="h-2 w-2 shrink-0 rounded-full bg-amber-200"></span>
        {/if}
        {outputMedia ? 'Render again' : 'Render clip'}
      </button>
    {/if}

    <!-- What happens to the finished clip: where it stands, and the two ways
         it moves on. Nothing here exists until there is a render to act on. -->
    {#if outputMedia}
      <SectionCard>
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

        <!-- The ways a finished clip moves on, in colours from the status
             ladder: teal for the approval review leads to, violet for the queue
             release puts it in. Only what's possible at this stage is shown. -->
        {#if canSendForReview || canSchedule}
          <div class="flex gap-2">
            {#if canSendForReview}
              <button
                onclick={handleSendForReview}
                class="flex-1 rounded-lg border border-teal-700/60 bg-teal-900/30 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-teal-200 transition-colors hover:bg-teal-900/50"
              >
                {selected.status === 'review' ? 'Re-send for review' : 'Send for review'}
              </button>
            {/if}
            {#if canSchedule}
              <button
                onclick={() => (queueDialogOpen = true)}
                class="flex-1 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500"
              >
                Schedule release
              </button>
            {/if}
          </div>
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

        <!-- Its own strip rather than more buttons in the action row: this is a
             decision about the clip, not another thing you can do to it. -->
        {#if selected.status === 'review'}
          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-4">
            <span class="mr-1 text-sm text-gray-400">Approve or reject:</span>
            <button
              onclick={() => handleDecision(true)}
              class="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Approve
            </button>
            <button
              onclick={() => handleDecision(false)}
              class="rounded-lg bg-red-800 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Reject
            </button>
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
      </SectionCard>
    {/if}
  {/snippet}

  <!-- The timeline runs under both panes rather than inside either, because
       it measures the whole clip and wants every pixel of the page to do it.
       Here it also stops scrolling away from the fields it drives.

       Only once there's a render. Before one there's no duration to lay
       anything out against and no frames to lay it on, and a strip built from
       the sources' own lengths would be a guess drawn as a measurement. -->
  {#snippet footer()}
    {#if outputMedia?.durationMs}
      <div class="border-t border-gray-800 bg-gray-950">
        <ClipTimeline
          durationMs={outputMedia.durationMs}
          stripUrl="/admin/clips/{selected.id}/strip?v={outputMedia.id}"
          {captions}
          oncaptions={setCaptions}
          {tracks}
          onaudio={async (id, changes) => {
            await autosave.run('the track', () => updateAudio({ id, ...changes }));
            await invalidateAll();
          }}
          video={previewVideo}
        />
      </div>
    {/if}
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
    label="Add footage or music"
    media={data.media}
    kind="all"
    noCrop
    modal
    multiple
    excludeRoles={['render']}
    selectedIds={[]}
    onmultiselect={(ids) => {
      mediaPickerOpen = false;
      handleAddMedia(ids);
    }}
    bind:open={mediaPickerOpen}
  />
{/if}

<!-- Post sheet dialog -->
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
