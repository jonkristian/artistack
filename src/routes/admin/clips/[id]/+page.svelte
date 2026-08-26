<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import MediaPicker from '$lib/components/ui/MediaPicker.svelte';
  import { ImageSelect, SortableList, TagInput, ToggleSwitch } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import { EditorPreview } from '$lib/components/ui';
  import { PhoneUploadDialog, QueueClipDialog, SourceClipDialog } from '$lib/components/dialogs';
  import { formatDuration } from '$lib/utils/upload';
  import { fieldClass, labelClass, numberClass } from '$lib/utils/classes';
  import {
    DEFAULT_CLIP_CONFIG,
    DEFAULT_ADVANCED_CONFIG,
    ADVANCED_GROUPS,
    CLIP_PRESETS,
    CLIP_STATUS_LABELS,
    CLIP_STATUS_DOTS,
    PLATFORM_NAMES,
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

  let sourcePickerOpen = $state(false);
  /** The source clip whose trim and mute are open, or null. */
  let editingSource = $state<(typeof data.sources)[number] | null>(null);
  let musicPickerOpen = $state(false);
  let phoneUploadOpen = $state(false);
  let postSheet = $state<{ markdown: string } | null>(null);

  const selected = $derived(data.project);

  const config = $derived<ClipRenderConfig>({
    ...DEFAULT_CLIP_CONFIG,
    ...((selected.config ?? {}) as Partial<ClipRenderConfig>)
  });

  const sources = $derived(data.sources);

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
    await deleteProject(id);
    toast.success('Deleted');
    await goto('/admin/clips');
  }

  /**
   * Stores this field's text as the boilerplate new clips start with. Saving an
   * empty field clears the default rather than storing nothing useful.
   */
  async function handleSaveDefault(field: 'tags' | 'description') {
    const result =
      field === 'tags'
        ? await saveClipDefaultTags(data.tags)
        : await saveClipDefaultDescription(selected.description ?? '');
    if (!result.success) {
      toast.error('Could not save the default');
      return;
    }
    toast.success(result.cleared ? `Default ${field} cleared` : `Saved as the default ${field}`);
  }

  /** Saves a set of project fields. */
  async function patch(fields: Record<string, unknown>) {
    await updateProject({ id: selected.id, ...fields });
    await invalidateAll();
  }

  async function patchConfig(changes: Partial<ClipRenderConfig>) {
    await patch({ config: changes });
  }

  // Advanced dials are merged server-side, so sending one field leaves the rest
  // untouched.
  async function patchAdvanced(changes: Partial<ClipAdvancedConfig>) {
    await patch({ config: { advanced: changes } });
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
    await patchConfig(preset.config);
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
  async function handleAddSources(ids: number[]) {
    if (!selected || ids.length === 0) return;
    for (const mediaId of ids) {
      await addSource({ projectId: selected.id, mediaId });
    }
    await invalidateAll();
    toast.success(`Added ${ids.length} clip${ids.length > 1 ? 's' : ''}`);
  }

  async function handleSelectMusic(url: string | null) {
    const item = url ? data.media.find((m) => m.url === url) : null;
    await patchConfig({ musicMediaId: item?.id ?? null });
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
    await reorderSources({
      projectId: selected.id,
      orderedIds: reordered.map((s) => s.id)
    });
    await invalidateAll();
  }

  async function handleRender() {
    const result = await startRender(selected.id);
    if (!result.success) {
      toast.error(result.message ?? 'Could not start the render');
      return;
    }
    liveJob = result.job as JobShape;
    toast.success('Render queued');
  }

  async function handleStop() {
    if (!job) return;
    await stopRender(job.id);
    toast.success('Render cancelled');
  }

  // --- review & release --------------------------------------------------

  async function handleSendForReview() {
    const result = await sendForReview({
      projectId: selected.id,
      origin: window.location.origin
    });
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
    await reviewDecision({ projectId: selected.id, approved, note });
    await invalidateAll();
    toast.success(approved ? 'Approved' : 'Rejected');
  }

  async function handlePreviewLink(rotate = false) {
    const fn = rotate ? resetPreviewLink : createPreviewLink;
    const result = await fn({ projectId: selected.id, origin: window.location.origin });
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
      const result = await addToQueue(selected.id);
      if (!result.success) {
        toast.error(result.message ?? 'Could not queue');
        return;
      }
    }

    // Sent even when null, so switching back to the drip clears an old pin.
    await setScheduledDate({ projectId: selected.id, when });
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
    await removeFromQueue(selected.id);
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
    const result = await publishNow({ projectId: selected.id, origin: window.location.origin });
    if (!result.success) {
      toast.error(result.error ?? 'Publish failed');
      return;
    }
    await invalidateAll();
    toast.success('Published');
  }

  async function handlePostSheet() {
    postSheet = await getPostSheet({ projectId: selected.id, origin: window.location.origin });
  }

  function copyPostSheet() {
    if (!postSheet) return;
    navigator.clipboard.writeText(postSheet.markdown);
    toast.success('Post sheet copied');
  }

  // --- timed captions ---------------------------------------------------

  const captions = $derived((selected.captions ?? []) as TimedCaption[]);

  async function setCaptions(next: TimedCaption[]) {
    await patch({ captions: next });
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
    await setCaptions(captions.filter((_, i) => i !== index));
  }
</script>

<!--
  Removing a row is the same gesture wherever it appears — a source clip, a
  caption, the music bed — so it gets one shape. The label carries the meaning
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
              onblur={(e) => patch({ name: e.currentTarget.value })}
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
                onchange={(names) => patch({ tags: names })}
              />
            {/key}
          </div>
          <div class="sm:col-span-2">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="text-sm text-gray-400" for="clip-desc">Description</label>
              {@render saveAsDefault('description')}
            </div>
            <textarea
              id="clip-desc"
              rows="3"
              class={fieldClass}
              value={selected.description ?? ''}
              placeholder="Keywords first — this becomes the post caption."
              onblur={(e) => patch({ description: e.currentTarget.value })}
            ></textarea>
          </div>
        </div>
      </SectionCard>

      <!-- Sources -->
      <SectionCard title="Source clips">
        {#snippet actions()}
          <div class="flex gap-2">
            <button
              onclick={() => (phoneUploadOpen = true)}
              title="Show a QR to upload footage straight from a phone"
              class="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 hover:bg-gray-700"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              From phone
            </button>
            <button
              onclick={() => (sourcePickerOpen = true)}
              class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-violet-500"
            >
              Add clips
            </button>
          </div>
        {/snippet}

        {#if sources.length === 0}
          <p class="text-sm text-gray-500">No sources yet. They render in the order listed here.</p>
        {:else}
          <SortableList items={sources} onreorder={handleReorderSources}>
            {#snippet children(source)}
              {@const item = mediaById.get(source.mediaId)}
              <div
                class="group flex items-center gap-3 rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800"
              >
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
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 8h16M4 16h16"
                      />
                    </svg>
                  </div>
                </div>

                <button
                  onclick={() => (editingSource = source)}
                  class="min-w-0 flex-1 text-left"
                  title="Trim and mute"
                >
                  <p class="truncate text-sm text-white">{item?.filename ?? 'Missing file'}</p>
                  <p class="text-xs text-gray-500">
                    {formatDuration(item?.durationMs)}
                    {#if source.trimStart != null || source.trimEnd != null}
                      · trimmed
                    {/if}
                    {#if source.muted}
                      · muted
                    {/if}
                  </p>
                </button>

                {@render removeButton(async () => {
                  await removeSource(source.id);
                  await invalidateAll();
                }, 'Remove source clip')}
              </div>
            {/snippet}
          </SortableList>
        {/if}
      </SectionCard>

      <!-- Timed captions -->
      <SectionCard title="Timed captions">
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
            No timed captions, so the clip renders without on-video text.
          </p>
        {:else}
          <ul class="space-y-2">
            {#each captions as caption, index (index)}
              <li class="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={caption.start}
                  onblur={(e) => updateCaption(index, { start: Number(e.currentTarget.value) })}
                  aria-label="Start seconds"
                  class={numberClass + ' w-16'}
                />
                <span class="text-gray-600">–</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={caption.end}
                  onblur={(e) => updateCaption(index, { end: Number(e.currentTarget.value) })}
                  aria-label="End seconds"
                  class={numberClass + ' w-16'}
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
        {/if}
      </SectionCard>

      <!-- Music -->
      <SectionCard title="Music bed">
        {#snippet actions()}
          <div class="flex gap-2">
            <button
              onclick={() => (musicPickerOpen = true)}
              class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              {config.musicMediaId ? 'Change' : 'Choose audio'}
            </button>
            {#if config.musicMediaId}
              {@render removeButton(() => handleSelectMusic(null), 'Remove music bed')}
            {/if}
          </div>
        {/snippet}

        {#if config.musicMediaId}
          {@const track = mediaById.get(config.musicMediaId)}
          <div class="space-y-4">
            <div>
              <p class="mb-2 text-sm text-gray-300">
                {track?.filename ?? 'Missing track'}
                <span class="text-gray-500">{formatDuration(track?.durationMs)}</span>
              </p>
              {#if track?.url}
                <!-- Native controls: scrubbing to find a sync point is exactly
                     what the browser's player already does well. -->
                <audio src={track.url} controls preload="metadata" class="h-9 w-full"></audio>
              {/if}
            </div>

            <!-- Two starts, because they answer different questions: when the
                 music comes in, and where in the song it comes in from. -->
            <div
              class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4"
            >
              <div>
                <label class={labelClass} for="m-start">Comes in at (s)</label>
                <input
                  id="m-start"
                  type="number"
                  step="0.1"
                  min="0"
                  class={numberClass + ' w-full'}
                  value={config.musicStart}
                  onblur={(e) => patchConfig({ musicStart: Number(e.currentTarget.value) })}
                />
                <p class="mt-1 text-xs text-gray-600">Where in the video.</p>
              </div>
              <div>
                <label class={labelClass} for="m-seek">Plays from (s)</label>
                <input
                  id="m-seek"
                  type="number"
                  step="0.1"
                  min="0"
                  class={numberClass + ' w-full'}
                  value={config.musicSeek}
                  onblur={(e) => patchConfig({ musicSeek: Number(e.currentTarget.value) })}
                />
                <p class="mt-1 text-xs text-gray-600">
                  Where in the track. Scrub above to find it.
                </p>
              </div>
              <div>
                <label class={labelClass} for="m-xfade">Crossfade takeover (s)</label>
                <input
                  id="m-xfade"
                  type="number"
                  step="0.1"
                  min="0"
                  class={numberClass + ' w-full'}
                  value={config.musicCrossfade ?? ''}
                  placeholder="off"
                  onblur={(e) =>
                    patchConfig({
                      musicCrossfade:
                        e.currentTarget.value === '' ? null : Number(e.currentTarget.value)
                    })}
                />
                <p class="mt-1 text-xs text-gray-600">Fade the clip audio out into the music.</p>
              </div>
            </div>

            <div class="flex flex-wrap gap-x-6 gap-y-3 border-t border-gray-800 pt-4">
              <ToggleSwitch
                label="Duck under speech"
                size="md"
                checked={config.duck}
                onchange={(duck) => patchConfig({ duck })}
              />
              <ToggleSwitch
                label="Replace clip audio"
                size="md"
                checked={config.musicOnly}
                onchange={(musicOnly) => patchConfig({ musicOnly })}
              />
            </div>
          </div>
        {:else}
          <p class="text-sm text-gray-500">No music bed. The clips' own audio is used as-is.</p>
        {/if}
      </SectionCard>

      <!-- Look -->
      <SectionCard title="Look">
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
              onchange={(e) => patchConfig({ aspect: e.currentTarget.value as never })}
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
              onchange={(e) => patchConfig({ fill: e.currentTarget.value as never })}
            >
              <option value="blur">Blurred background</option>
              <option value="black">Black bars</option>
              <option value="crop">Crop to fill</option>
            </select>
          </div>
        </div>

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
            <div
              class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4"
            >
              <div>
                <label class={labelClass} for="opt-tone">Tone</label>
                <select
                  id="opt-tone"
                  class={fieldClass}
                  value={config.tone}
                  onchange={(e) => patchConfig({ tone: e.currentTarget.value as never })}
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
                  onchange={(e) => patchConfig({ captionPosition: e.currentTarget.value as never })}
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
                  onchange={(e) => patchConfig({ speed: Number(e.currentTarget.value) })}
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
                      patchConfig({ [option.key]: e.currentTarget.checked } as never)}
                    class="rounded border-gray-600 bg-gray-700 text-violet-500"
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Branding. Under Look because it is a look decision: which mark the
             clip wears and where. It sat in its own card beside the render for
             a while, which put a styling choice next to a publishing one. -->
        <div class="mt-6 border-t border-gray-800 pt-5">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-medium tracking-wider text-gray-400 uppercase">Branding</h3>
            <span class="text-xs text-gray-500">
              {#if config.randomGraphics}
                Random of {data.graphics.length}
              {:else if activeGraphic}
                {activeGraphic.filename}
              {/if}
            </span>
          </div>
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
                  onchange={(e) => patchConfig({ [option.key]: e.currentTarget.checked } as never)}
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
        </div>
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
      <button
        onclick={handleRender}
        disabled={!data.renderingAvailable || sources.length === 0}
        class="w-full rounded-lg bg-sky-700 px-4 py-3 text-base font-medium whitespace-nowrap text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {outputMedia ? 'Render again' : 'Render clip'}
      </button>
    {/if}

    <!-- What happens to the finished clip: where it stands, and the two ways
         it moves on. Nothing here exists until there is a render to act on. -->
    {#if outputMedia}
      <SectionCard>
        <!-- Where the clip stands, stated once, at the top. The review strip
             below carries the decision; this only says what it is. Where it
             landed belongs with it — a release and its platforms are one fact,
             not two, so the rows sit here rather than at the far end of the card. -->
        <div class="mb-3 flex items-center gap-2 text-sm">
          <span
            class="h-2 w-2 shrink-0 rounded-full {CLIP_STATUS_DOTS[selected.status] ??
              'bg-gray-500'}"
          ></span>
          <span class="text-gray-300">{CLIP_STATUS_LABELS[selected.status] ?? selected.status}</span
          >
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
                  <span class="truncate text-red-400/80" title={post.error}>{post.error}</span>
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
                    await setQueueGap({
                      projectId: selected.id,
                      days: raw === '' ? null : Number(raw)
                    });
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
</EditorPreview>

{#if editingSource}
  <!-- Captured, not read through `editingSource`: the save fires as the dialog
       closes, and closing is what sets that back to null. -->
  {@const source = editingSource}
  {@const item = mediaById.get(source.mediaId)}
  <SourceClipDialog
    filename={item?.filename ?? 'Missing file'}
    duration={formatDuration(item?.durationMs)}
    trimStart={source.trimStart}
    trimEnd={source.trimEnd}
    muted={source.muted ?? false}
    onchange={async (values) => {
      await updateSource({ id: source.id, ...values });
      await invalidateAll();
    }}
    onclose={() => (editingSource = null)}
  />
{/if}

<!-- Pickers live outside the editor so their modals aren't clipped -->
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
    label="Add footage to “{selected.name}”"
  />
{/if}

{#if sourcePickerOpen}
  <MediaPicker
    label="Add source clips"
    media={data.media}
    kind="video"
    noCrop
    modal
    multiple
    excludeRoles={['render']}
    selectedIds={[]}
    onmultiselect={(ids) => {
      sourcePickerOpen = false;
      handleAddSources(ids);
    }}
    bind:open={sourcePickerOpen}
  />
{/if}

{#if musicPickerOpen}
  <MediaPicker
    label="Choose music"
    media={data.media}
    kind="audio"
    noCrop
    modal
    onselect={(url) => {
      musicPickerOpen = false;
      handleSelectMusic(url);
    }}
    bind:open={musicPickerOpen}
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
