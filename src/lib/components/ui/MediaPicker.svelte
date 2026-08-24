<script lang="ts">
  import type { Media, MediaRole } from '$lib/server/schema';
  import { ImageModal, type Shape } from '$lib/components/dialogs';
  import { addMedia } from '../../../routes/admin/media/data.remote';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import {
    uploadFile as uploadToServer,
    isVideoFile,
    isAudioFile,
    isImageFile,
    formatDuration,
    ACCEPT_IMAGE,
    ACCEPT_VIDEO,
    ACCEPT_AUDIO
  } from '$lib/utils/upload';

  /** Which media types this picker offers and accepts. */
  type MediaKind = 'image' | 'video' | 'audio' | 'all';

  interface Props {
    value?: string | null;
    label: string;
    media: Media[];
    aspectRatio?: string;
    shapes?: Shape[];
    defaultShape?: Shape;
    noCrop?: boolean;
    onselect?: (url: string | null, shape?: Shape) => void;
    multiple?: boolean;
    selectedIds?: number[];
    onmultiselect?: (ids: number[]) => void;
    open?: boolean;
    kind?: MediaKind;
    /**
     * Roles to leave out. Mime type alone can't tell raw footage from a
     * finished render — both are video/mp4 — so a source picker passes
     * `['render']` to keep its own outputs from coming back round as inputs.
     */
    excludeRoles?: MediaRole[];
    /**
     * Render only the modal, with no inline preview/drop area. For callers that
     * drive `open` themselves and mount the picker on demand, rather than
     * showing a persistent trigger tied to a `value`.
     */
    modal?: boolean;
  }

  let {
    value = null,
    label,
    media,
    aspectRatio = '16/9',
    shapes = ['circle', 'rounded', 'square'],
    defaultShape = 'rounded',
    noCrop = false,
    onselect,
    multiple = false,
    selectedIds = [],
    onmultiselect,
    open = $bindable(false),
    // Defaults to images so every existing caller (profile photo, favicon,
    // gallery) keeps its current behaviour without opting out.
    kind = 'image',
    modal = false,
    excludeRoles = []
  }: Props = $props();

  let pendingFile = $state<File | null>(null);
  let originalFile = $state<File | null>(null);
  let uploading = $state(false);
  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  // In multi mode, internal selection state (copy of selectedIds to allow cancel)
  let multiSelection = $state<number[]>([]);

  // `open` is bindable and is the single source of truth for whether the modal
  // is up. There used to be a second `showPicker` flag kept in step by a pair of
  // effects that each wrote what the other read — the same shape that locked the
  // tour date dialog open. One effect, and it only resets the view on open.
  $effect(() => {
    if (!open) return;
    if (multiple) multiSelection = [...selectedIds];
    currentPage = 1;
  });

  const acceptsVideo = $derived(kind === 'video' || kind === 'all');
  const acceptsAudio = $derived(kind === 'audio' || kind === 'all');
  const acceptsImage = $derived(kind === 'image' || kind === 'all');

  const acceptAttr = $derived(
    [
      acceptsImage ? ACCEPT_IMAGE : '',
      acceptsVideo ? ACCEPT_VIDEO : '',
      acceptsAudio ? ACCEPT_AUDIO : ''
    ]
      .filter(Boolean)
      .join(',')
  );

  const KIND_LABELS: Record<MediaKind, string> = {
    image: 'image',
    video: 'video',
    audio: 'audio',
    all: 'file'
  };
  const kindLabel = $derived(KIND_LABELS[kind]);

  // Only offer what this picker is for — a gallery shouldn't list clips, and the
  // clip studio's music picker shouldn't list stills.
  const filteredMedia = $derived(
    media.filter((m) => {
      if (excludeRoles.includes(m.role)) return false;
      if (m.mimeType.startsWith('video/')) return acceptsVideo;
      if (m.mimeType.startsWith('audio/')) return acceptsAudio;
      return acceptsImage;
    })
  );

  // Pagination
  const perPage = 12;
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(filteredMedia.length / perPage));
  const visibleMedia = $derived(
    filteredMedia.slice((currentPage - 1) * perPage, currentPage * perPage)
  );

  function isAcceptedFile(file: File): boolean {
    if (isVideoFile(file)) return acceptsVideo;
    if (isAudioFile(file)) return acceptsAudio;
    if (isImageFile(file)) return acceptsImage;
    return false;
  }

  /**
   * Uploads to the server and records the row in the media library.
   * Callers own the `uploading` flag, since some of them wrap several uploads.
   */
  async function uploadToLibrary(file: File): Promise<{ url: string; id: number } | null> {
    try {
      const result = await uploadToServer(file);
      const added = await addMedia({
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
      return { url: result.url, id: added.media.id };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
      return null;
    }
  }

  /**
   * Entry point for both the file dialog and drag-and-drop.
   *
   * A single-select picker takes the first file and ignores the rest; a
   * multi-select one uploads the lot and ticks each new row, so "upload five
   * takes and add them" is one pass rather than five trips through the dialog.
   * Rejected files are reported rather than dropped silently — picking five
   * clips and getting one with no explanation is the worse failure.
   */
  async function handleFiles(files: File[]) {
    const accepted = files.filter(isAcceptedFile);
    const skipped = files.length - accepted.length;

    if (skipped > 0) {
      toast.error(
        `${skipped} file${skipped > 1 ? 's were' : ' was'} skipped — this picker only takes ${kindLabel} files.`
      );
    }
    if (accepted.length === 0) return;

    if (!multiple) {
      await handleFileSelect(accepted[0]);
      return;
    }

    uploading = true;
    try {
      // Sequential rather than parallel: these are large files, and the upload
      // endpoint writes them to disk.
      for (const file of accepted) {
        const added = await uploadToLibrary(file);
        if (added) multiSelection = [...multiSelection, added.id];
      }
    } finally {
      uploading = false;
    }
  }

  /** Single-select flow: upload (cropping first for images), then hand back the URL. */
  async function handleFileSelect(file: File) {
    open = false;

    // Video and audio are never cropped — the crop modal is a still-image editor.
    if (noCrop || isVideoFile(file) || isAudioFile(file)) {
      uploading = true;
      try {
        const added = await uploadToLibrary(file);
        if (added && onselect) onselect(added.url);
      } finally {
        uploading = false;
      }
      return;
    }

    originalFile = file;
    pendingFile = file;
  }

  function handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) handleFiles(files);
    input.value = '';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) handleFiles(files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }

  async function handleSelect(item: Media) {
    // Multi mode: toggle selection
    if (multiple) {
      if (multiSelection.includes(item.id)) {
        multiSelection = multiSelection.filter((i) => i !== item.id);
      } else {
        multiSelection = [...multiSelection, item.id];
      }
      return;
    }

    // Single mode
    open = false;
    originalFile = null;

    if (noCrop || !item.mimeType.startsWith('image/')) {
      if (onselect) onselect(item.url);
      return;
    }

    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const file = new File([blob], item.filename, { type: item.mimeType });
      pendingFile = file;
    } catch (err) {
      console.error('Failed to load image for cropping:', err);
    }
  }

  function handleMultiDone() {
    if (onmultiselect) onmultiselect(multiSelection);
    open = false;
  }

  function handleClose() {
    open = false;
  }

  async function handleCropConfirm(croppedFile: File, selectedShape: Shape) {
    const fileToAddToLibrary = originalFile;
    pendingFile = null;
    originalFile = null;
    uploading = true;

    try {
      // Keep the uncropped original in the library alongside the crop.
      if (fileToAddToLibrary) {
        await uploadToLibrary(fileToAddToLibrary);
      }

      const { url } = await uploadToServer(croppedFile, 'cropped');
      if (onselect) onselect(url, selectedShape);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      uploading = false;
    }
  }

  function handleCropCancel() {
    pendingFile = null;
    originalFile = null;
  }

  function handleRemove() {
    if (onselect) onselect(null);
  }

  async function handleEdit() {
    if (!value) return;
    try {
      const res = await fetch(value);
      const blob = await res.blob();
      const file = new File([blob], 'edit.jpg', { type: blob.type });
      pendingFile = file;
    } catch (err) {
      console.error('Failed to load image for editing:', err);
    }
  }
</script>

<!-- Hidden file input -->
<input
  type="file"
  accept={acceptAttr}
  {multiple}
  class="hidden"
  bind:this={fileInput}
  onchange={handleInputChange}
/>

<!-- Single mode: inline preview/trigger area -->
{#if !multiple && !modal}
  <div class="space-y-2">
    <span class="block text-sm text-gray-400">{label}</span>

    <div
      class="relative overflow-hidden rounded-lg border-2 border-dashed transition-colors {isDragging
        ? 'border-violet-500 bg-violet-500/10'
        : 'border-gray-600 hover:border-gray-500'}"
      style="aspect-ratio: {aspectRatio}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button"
      tabindex="0"
    >
      {#if value}
        {#if /\.(mp4|mov|webm)$/i.test(value)}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={value} muted playsinline class="h-full w-full object-cover"></video>
        {:else}
          <img src={value} alt={label} class="h-full w-full object-cover" />
        {/if}
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100"
        >
          {#if uploading}
            <div
              class="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"
            ></div>
          {:else}
            <div class="flex gap-2">
              <button
                type="button"
                onclick={handleEdit}
                class="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Edit
              </button>
              <button
                type="button"
                onclick={() => {
                  currentPage = 1;
                  open = true;
                }}
                class="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-white"
              >
                Replace
              </button>
              <button
                type="button"
                onclick={handleRemove}
                class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Remove
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <button
          type="button"
          onclick={() => {
            currentPage = 1;
            open = true;
          }}
          disabled={uploading}
          class="flex h-full w-full flex-col items-center justify-center p-4 text-center"
        >
          {#if uploading}
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white"
            ></div>
          {:else if isDragging}
            <svg
              class="mb-2 h-10 w-10 text-violet-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span class="text-sm text-violet-400">Drop {kindLabel} here</span>
          {:else}
            <svg
              class="mb-2 h-10 w-10 text-gray-500"
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
            <span class="text-sm text-gray-400">Click to select or drag {kindLabel}</span>
          {/if}
        </button>
      {/if}
    </div>
  </div>
{/if}

<!-- Media Picker Modal -->
{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label={multiple
      ? `Select ${kindLabel}s (${multiSelection.length} selected)`
      : 'Select media'}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
    >
      <div class="flex items-center justify-between border-b border-gray-700 p-4">
        <h2 class="text-lg font-semibold text-white">
          {#if multiple}
            Select {kindLabel}s ({multiSelection.length} selected)
          {:else}
            Select Media
          {/if}
        </h2>
        <div class="flex items-center gap-3">
          {#if multiple}
            <button
              type="button"
              onclick={handleMultiDone}
              class="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              Done
            </button>
          {/if}
          <a
            href="/admin/media"
            target="_blank"
            class="text-sm text-violet-400 hover:text-violet-300"
          >
            Manage library
          </a>
          <button onclick={handleClose} class="text-gray-400 hover:text-white" aria-label="Close">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-4">
        <!-- Upload area - compact -->
        <div
          class="mb-4 flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-colors {isDragging
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-gray-700'}"
        >
          <svg
            class="h-5 w-5 shrink-0 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span class="text-sm text-gray-400">
            {isDragging ? `Drop ${kindLabel} here` : `Drop ${kindLabel} or`}
          </span>
          {#if uploading}
            <div
              class="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-white"
            ></div>
          {:else}
            <button
              type="button"
              onclick={() => fileInput.click()}
              class="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              Choose file
            </button>
          {/if}
        </div>

        {#if filteredMedia.length === 0}
          <p class="py-4 text-center text-sm text-gray-500">
            No {kind === 'all' ? 'media' : kindLabel} in library yet
          </p>
        {:else}
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {#each visibleMedia as item (item.id)}
              {@const isSelected = multiple && multiSelection.includes(item.id)}
              <button
                type="button"
                onclick={() => handleSelect(item)}
                class="group relative aspect-square overflow-hidden rounded-lg ring-2 transition-all {multiple
                  ? isSelected
                    ? 'ring-violet-500'
                    : 'opacity-60 ring-transparent hover:opacity-100'
                  : 'ring-transparent hover:ring-violet-500'}"
              >
                {#if item.mimeType.startsWith('audio/')}
                  <!-- No poster frame exists for audio, so draw a tile instead
                       of pointing an <img> at the audio file. -->
                  <div
                    class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-800 p-2"
                  >
                    <svg class="h-6 w-6 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                    </svg>
                    <span class="w-full truncate text-center text-[10px] text-gray-400">
                      {item.filename}
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
                {#if item.mimeType.startsWith('video/')}
                  <div
                    class="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <div class="rounded-full bg-black/50 p-2 backdrop-blur-sm">
                      <svg class="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                {/if}
                {#if item.durationMs}
                  <div
                    class="pointer-events-none absolute right-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white tabular-nums"
                  >
                    {formatDuration(item.durationMs)}
                  </div>
                {/if}
                {#if isSelected}
                  <div class="absolute inset-0 flex items-center justify-center bg-violet-600/30">
                    <svg
                      class="h-6 w-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                {/if}
              </button>
            {/each}
          </div>
          {#if totalPages > 1}
            <div class="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onclick={() => (currentPage = Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                class="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                class="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if !multiple}
  <ImageModal
    file={pendingFile}
    {shapes}
    {defaultShape}
    onconfirm={handleCropConfirm}
    oncancel={handleCropCancel}
  />
{/if}
