<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import type { PageData } from './$types';
  import {
    addMedia,
    deleteMedia,
    addToPressKit,
    removeFromPressKit,
    addToClipGraphics,
    removeFromClipGraphics,
    setDefaultClipGraphic,
    setMediaTags
  } from './data.remote';
  import {
    uploadFile as uploadToServer,
    isVideoFile,
    isAudioFile,
    formatDuration,
    ACCEPT_IMAGE,
    ACCEPT_VIDEO,
    ACCEPT_AUDIO,
    ACCEPT_DOCUMENT
  } from '$lib/utils/upload';
  import { PhoneUploadDialog } from '$lib/components/dialogs';
  import {
    FilterSelect,
    MediaDropZone,
    SelectCheckbox,
    SelectionToolbar,
    TagInput
  } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import { mediaDrag } from '$lib/stores/mediaDrag.svelte';

  let phoneUploadOpen = $state(false);

  let { data }: { data: PageData } = $props();

  let fileInput: HTMLInputElement;
  let uploading = $state(false);
  /** 0–1 while a chunked upload is in flight; null when the file went in one request. */
  let uploadProgress = $state<number | null>(null);
  let generating = $state(false);

  // Role filter. Renders are listed deliberately — they're real files taking up
  // real disk, so hiding them everywhere would make them impossible to clear out.
  const ROLES = [
    { key: 'asset', label: 'Images' },
    { key: 'source', label: 'Footage' },
    { key: 'music', label: 'Music' },
    { key: 'document', label: 'Documents' },
    { key: 'render', label: 'Renders' }
  ] as const;

  /** Empty means every role; there's no separate "all" value to keep in sync. */
  let roleFilter = $state<string[]>([]);

  const roleOptions = $derived(
    ROLES.map((r) => ({ key: r.key, label: r.label, count: roleCounts[r.key] ?? 0 }))
  );

  const roleCounts = $derived(
    data.media.reduce<Record<string, number>>((acc, m) => {
      acc[m.role] = (acc[m.role] ?? 0) + 1;
      return acc;
    }, {})
  );

  const shownMedia = $derived(
    roleFilter.length === 0 ? data.media : data.media.filter((m) => roleFilter.includes(m.role))
  );

  // Pagination
  const perPage = 20;
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(shownMedia.length / perPage));
  const visibleMedia = $derived(
    shownMedia.slice((currentPage - 1) * perPage, currentPage * perPage)
  );

  // Multi-select. Scoped to the current page, so paging doesn't drop a
  // selection made on the page before.
  const selection = new Selection();

  // The file whose tags are open for editing, or null.
  let taggingId = $state<number | null>(null);
  const taggingItem = $derived(data.media.find((m) => m.id === taggingId) ?? null);

  async function saveTags(names: string[]) {
    if (taggingId === null) return;
    await setMediaTags({ id: taggingId, tags: names });
    await invalidateAll();
  }

  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} file${count > 1 ? 's' : ''}?`)) return;

    for (const id of selection.ids) {
      await deleteMedia(id);
    }
    await invalidateAll();
    toast.success(`Deleted ${count} file${count > 1 ? 's' : ''}`);
    selection.clear();
  }

  // Check if press kit should be shown (toggle in settings)
  const showPressKit = $derived(data.pressKitEnabled);

  // Track which media items are in press kit
  const pressKitMediaIds = $derived(new Set(data.pressKitMediaIds));

  const clipGraphicItems = $derived(
    data.clipGraphicsMediaIds
      .map((id) => data.media.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m != null)
  );

  // Press kit media items for display
  const pressKitItems = $derived(
    data.pressKitMediaIds
      .map((id) => data.media.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m != null)
  );

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      for (const file of files) {
        await uploadFile(file);
      }
    }
    input.value = '';
  }

  // Images are buffered server-side and stay small; video and audio stream to
  // disk, so they get larger ceilings. All are enforced on the server too.
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

  async function uploadFile(file: File) {
    const limit = isVideoFile(file)
      ? MAX_VIDEO_SIZE
      : isAudioFile(file)
        ? MAX_AUDIO_SIZE
        : MAX_IMAGE_SIZE;
    if (file.size > limit) {
      toast.error(`File "${file.name}" is too large. Max ${limit / 1024 / 1024}MB.`);
      return;
    }

    uploading = true;

    try {
      const result = await uploadToServer(file, 'media', (f) => (uploadProgress = f));

      await addMedia({
        filename: file.name,
        url: result.url,
        originalUrl: result.originalUrl,
        thumbnailUrl: result.thumbnailUrl,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        size: result.size,
        originalSize: result.originalSize,
        durationMs: result.durationMs
      });

      await invalidateAll();
      toast.success('Uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      uploading = false;
      uploadProgress = null;
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this file?')) return;
    await deleteMedia(id);
    await invalidateAll();
    toast.success('Deleted');
  }

  /**
   * A tile is draggable whenever there's somewhere to drop it. Being in one set
   * says nothing about the other — a logo in the press kit is exactly the file
   * you'd also want on your clips — so membership doesn't come into it. The
   * drop handlers ignore a file that's already in the set they're dropped on.
   */
  const hasDropZone = $derived(showPressKit || data.clipsEnabled);

  async function handleAddToPressKit(mediaId: number) {
    await addToPressKit({ mediaId });
    await invalidateAll();
    toast.success('Added to Press Kit');
  }

  async function handleRemoveFromPressKit(mediaId: number) {
    await removeFromPressKit({ mediaId });
    await invalidateAll();
    toast.success('Removed from Press Kit');
  }

  async function handleAddToClipGraphics(mediaId: number) {
    await addToClipGraphics({ mediaId });
    await invalidateAll();
    toast.success('Added to Clip Graphics');
  }

  async function handleRemoveFromClipGraphics(mediaId: number) {
    await removeFromClipGraphics({ mediaId });
    await invalidateAll();
    toast.success('Removed from Clip Graphics');
  }

  async function handleSetDefaultClipGraphic(mediaId: number) {
    await setDefaultClipGraphic({ mediaId });
    await invalidateAll();
    toast.success('Default graphic set');
  }

  async function handleGeneratePressKit() {
    generating = true;
    try {
      const res = await fetch('/api/press-kit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await res.json();

      if (result.success) {
        await invalidateAll();
        toast.success('Press Kit generated!');
      } else {
        toast.error(result.error || 'Failed to generate');
      }
    } catch {
      toast.error('Failed to generate Press Kit');
    }
    generating = false;
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(date: Date | null): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <header class="mb-6 flex flex-wrap items-center justify-end gap-3">
    <div class="flex items-center gap-2">
      <button
        onclick={() => (phoneUploadOpen = true)}
        class="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium whitespace-nowrap text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
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
      <button
        onclick={() => fileInput.click()}
        disabled={uploading}
        class="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        {#if uploading}
          <div
            class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          ></div>
          {uploadProgress === null
            ? 'Uploading...'
            : `Uploading ${Math.round(uploadProgress * 100)}%`}
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Upload
        {/if}
      </button>
    </div>
  </header>

  <PhoneUploadDialog bind:open={phoneUploadOpen} label="Add to the media library" />

  <!-- Curated sets: side by side when both are on, full width when only one is -->
  <div class="mb-6 grid gap-6 {showPressKit && data.clipsEnabled ? 'lg:grid-cols-2' : ''}">
    {#if showPressKit}
      <MediaDropZone
        title="Press Kit"
        description="Drag photos, logos and documents here"
        items={pressKitItems}
        ondropmedia={handleAddToPressKit}
        onremove={handleRemoveFromPressKit}
      >
        {#snippet icon()}
          <svg
            class="h-6 w-6 text-violet-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        {/snippet}

        {#snippet actions()}
          {#if data.pressKitZipExists}
            <a
              href="/uploads/press-kit.zip"
              download
              title="Download press-kit.zip"
              aria-label="Download press-kit.zip"
              class="rounded-lg border border-gray-700 bg-gray-800 p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </a>
          {/if}
          <button
            onclick={handleGeneratePressKit}
            disabled={generating || pressKitItems.length === 0}
            class="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {#if generating}
              <div
                class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
              ></div>
              Generating...
            {:else}
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Generate ZIP
            {/if}
          </button>
        {/snippet}
      </MediaDropZone>
    {/if}

    {#if data.clipsEnabled}
      <MediaDropZone
        title="Clip Graphics"
        description="Drag logos here to use them on clips"
        items={clipGraphicItems}
        ondropmedia={handleAddToClipGraphics}
        onremove={handleRemoveFromClipGraphics}
        emptyLabel="Drag logos from below to use them on clips"
      >
        {#snippet icon()}
          <svg
            class="h-6 w-6 text-violet-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
            />
          </svg>
        {/snippet}

        {#snippet overlay(item)}
          <!-- The default is what a clip uses when it hasn't picked one itself. -->
          {#if data.defaultClipGraphicMediaId === item.id}
            <span
              class="absolute bottom-1 left-1 rounded bg-violet-600 px-1 py-0.5 text-[9px] font-medium text-white"
            >
              Default
            </span>
          {:else}
            <button
              onclick={() => handleSetDefaultClipGraphic(item.id)}
              class="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
            >
              Set default
            </button>
          {/if}
        {/snippet}
      </MediaDropZone>
    {/if}
  </div>

  <!-- Media Gallery -->
  {#if data.media.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-700 py-16"
    >
      <svg
        class="mb-4 h-12 w-12 text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <p class="mb-2 text-lg font-medium text-gray-400">No media yet</p>
      <p class="mb-4 text-sm text-gray-500">Upload images and video to build your media library</p>
      <button
        onclick={() => fileInput.click()}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500"
      >
        Upload your first file
      </button>
    </div>
  {:else}
    <!-- Filter and bulk actions share a row: the filter's own count already
         reports how many files are showing, so a separate tally said it twice. -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <FilterSelect
        options={roleOptions}
        bind:selected={roleFilter}
        total={data.media.length}
        onchange={() => {
          currentPage = 1;
          selection.clear();
        }}
      />

      <SelectionToolbar
        count={selection.size}
        allSelected={selection.covers(visibleMedia)}
        onToggleAll={() => selection.toggleAll(visibleMedia)}
        onDelete={deleteSelected}
        onClear={() => selection.clear()}
      />
    </div>

    <div
      class="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-4 pb-16"
    >
      {#each visibleMedia as item (item.id)}
        <div
          role="button"
          tabindex="0"
          aria-label={showPressKit && pressKitMediaIds.has(item.id)
            ? `${item.alt || item.filename} - in press kit`
            : item.alt || item.filename}
          onpointerdown={(e) => hasDropZone && mediaDrag.start(item.id, e)}
          class="group relative overflow-hidden rounded-xl bg-gray-800 {hasDropZone
            ? 'cursor-grab touch-none'
            : ''} {mediaDrag.dragging === item.id ? 'opacity-50' : ''} {selection.has(item.id)
            ? 'ring-2 ring-violet-500'
            : ''}"
        >
          <div class="aspect-square">
            {#if item.mimeType.startsWith('audio/')}
              <!-- No poster frame exists for audio, so draw a tile instead of
                   pointing an <img> at the audio file. -->
              <div class="flex h-full w-full items-center justify-center bg-gray-800">
                <svg class="h-10 w-10 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                </svg>
              </div>
            {:else if item.role === 'document'}
              <!-- Same reason as audio, plus the extension: one PDF looks much
                   like another, so the name is the only thing that identifies it. -->
              <div
                class="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-800 px-2"
              >
                <svg
                  class="h-9 w-9 text-violet-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span class="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
                  {item.filename.split('.').pop()}
                </span>
              </div>
            {:else}
              <img
                src={item.thumbnailUrl || item.url}
                alt={item.alt || item.filename}
                loading="lazy"
                class="h-full w-full object-cover"
              />
            {/if}
          </div>
          <!-- Video marker: the thumbnail is a poster frame, so without this a
               clip is indistinguishable from a still at a glance. -->
          {#if item.mimeType.startsWith('video/')}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0"
            >
              <div class="rounded-full bg-black/50 p-2.5 backdrop-blur-sm">
                <svg class="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            {#if item.durationMs}
              <div
                class="pointer-events-none absolute right-2 bottom-12 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums"
              >
                {formatDuration(item.durationMs)}
              </div>
            {/if}
          {/if}
          {#if data.tagsByMedia[item.id]?.length}
            <span
              class="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-gray-300"
              title={data.tagsByMedia[item.id].join(', ')}
            >
              {data.tagsByMedia[item.id].length} tag{data.tagsByMedia[item.id].length === 1
                ? ''
                : 's'}
            </span>
          {/if}
          <SelectCheckbox
            checked={selection.has(item.id)}
            onclick={(e) => {
              e.stopPropagation();
              selection.toggle(item.id);
            }}
          />
          <!-- Hover overlay -->
          <div
            class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <div class="flex gap-2">
              <button
                onclick={() => (taggingId = item.id)}
                class="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-gray-700"
              >
                Tags
              </button>
              <button
                onclick={() => handleDelete(item.id)}
                class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
            <div class="mt-3 text-center text-xs text-gray-400">
              {#if item.width && item.height}
                <p>{item.width} × {item.height}</p>
              {/if}
              {#if item.size}
                <p>{formatFileSize(item.size)}</p>
              {/if}
              {#if item.durationMs}
                <p>{formatDuration(item.durationMs)}</p>
              {/if}
            </div>
          </div>
          <!-- Press Kit badge or Drag hint (musicians only) -->
          {#if showPressKit}
            {#if pressKitMediaIds.has(item.id)}
              <div
                class="absolute top-2 right-2 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
              >
                In Press Kit
              </div>
            {:else}
              <div
                class="absolute top-2 right-2 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <svg
                  class="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
              </div>
            {/if}
          {/if}
          <!-- Info bar -->
          <div
            class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6"
          >
            <p class="truncate text-sm text-white">{item.alt || item.filename}</p>
            <p class="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Fixed Pagination -->
  {#if shownMedia.length > 0 && totalPages > 1}
    <div
      class="fixed right-0 bottom-0 left-0 flex items-center justify-center gap-2 border-t border-gray-800 bg-gray-950/95 py-3 backdrop-blur-sm lg:left-56"
    >
      <button
        type="button"
        onclick={() => (currentPage = Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        aria-label="Previous page"
        class="rounded-lg px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <span class="text-sm text-gray-400">{currentPage} / {totalPages}</span>
      <button
        type="button"
        onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        class="rounded-lg px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept={`${ACCEPT_IMAGE},${ACCEPT_VIDEO},${ACCEPT_AUDIO},${ACCEPT_DOCUMENT}`}
    multiple
    onchange={handleFileSelect}
    class="sr-only"
  />
</div>

<!-- Tag editor. Mounted only while open so TagInput initialises on mount. -->
{#if taggingItem}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) taggingId = null;
    }}
  >
    <div class="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="truncate text-sm font-medium text-white">{taggingItem.filename}</h2>
          <p class="mt-0.5 text-xs text-gray-500">Tags are shared with clips</p>
        </div>
        <button
          onclick={() => (taggingId = null)}
          aria-label="Close"
          class="shrink-0 text-gray-400 hover:text-white">✕</button
        >
      </div>
      <TagInput
        initial={data.tagsByMedia[taggingItem.id] ?? []}
        suggestions={data.allTags}
        onchange={saveTags}
      />
    </div>
  </div>
{/if}
