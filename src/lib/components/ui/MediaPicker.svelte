<script lang="ts">
  import type { Media } from '$lib/server/schema';
  import { ImageModal, type Shape } from '$lib/components/dialogs';
  import { addMedia } from '../../../routes/admin/media/data.remote';
  import { invalidateAll } from '$app/navigation';

  interface Props {
    value: string | null;
    label: string;
    media: Media[];
    aspectRatio?: string;
    shapes?: Shape[];
    defaultShape?: Shape;
    noCrop?: boolean;
    onselect: (url: string | null, shape?: Shape) => void;
  }

  let {
    value,
    label,
    media,
    aspectRatio = '16/9',
    shapes = ['circle', 'rounded', 'square'],
    defaultShape = 'rounded',
    noCrop = false,
    onselect
  }: Props = $props();

  let showPicker = $state(false);
  let pendingFile = $state<File | null>(null);
  let originalFile = $state<File | null>(null); // Store original for library upload
  let uploading = $state(false);
  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  // Pagination
  const perPage = 12;
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(media.length / perPage));
  const visibleMedia = $derived(media.slice((currentPage - 1) * perPage, currentPage * perPage));

  function isValidImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }

  async function handleFileSelect(file: File) {
    if (!isValidImageFile(file)) {
      alert('Please select an image file');
      return;
    }
    showPicker = false;

    // If noCrop mode, upload directly to library and return URL
    if (noCrop) {
      uploading = true;
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'media');

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const { url, originalUrl, thumbnailUrl, width, height, size, originalSize, mimeType } =
            await res.json();
          await addMedia({
            filename: file.name,
            url,
            originalUrl,
            thumbnailUrl,
            mimeType,
            width,
            height,
            size,
            originalSize
          });
          await invalidateAll();
          onselect(url);
        }
      } finally {
        uploading = false;
      }
      return;
    }

    originalFile = file; // Store original for library
    pendingFile = file;
  }

  function handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFileSelect(file);
      input.value = ''; // Reset for re-selection
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) {
      handleFileSelect(file);
    }
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
    showPicker = false;
    originalFile = null; // Already in library

    // If noCrop mode, just return the URL directly
    if (noCrop) {
      onselect(item.url);
      return;
    }

    // Fetch the image and open crop modal
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const file = new File([blob], item.filename, { type: item.mimeType });
      pendingFile = file;
    } catch (err) {
      console.error('Failed to load image for cropping:', err);
    }
  }

  async function handleCropConfirm(croppedFile: File, selectedShape: Shape) {
    const fileToAddToLibrary = originalFile;
    pendingFile = null;
    originalFile = null;
    uploading = true;

    try {
      // If this is a fresh upload, add the original to the media library first
      if (fileToAddToLibrary) {
        const origFormData = new FormData();
        origFormData.append('file', fileToAddToLibrary);
        origFormData.append('type', 'media');

        const origRes = await fetch('/api/upload', {
          method: 'POST',
          body: origFormData
        });

        if (origRes.ok) {
          const { url, originalUrl, thumbnailUrl, width, height, size, originalSize, mimeType } =
            await origRes.json();
          await addMedia({
            filename: fileToAddToLibrary.name,
            url,
            originalUrl,
            thumbnailUrl,
            mimeType,
            width,
            height,
            size,
            originalSize
          });
          // Refresh the media list
          await invalidateAll();
        }
      }

      // Upload the cropped version for use in the block
      const formData = new FormData();
      formData.append('file', croppedFile);
      formData.append('type', 'cropped');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Upload failed');
        return;
      }

      const { url } = await res.json();
      onselect(url, selectedShape);
    } finally {
      uploading = false;
    }
  }

  function handleCropCancel() {
    pendingFile = null;
    originalFile = null;
  }

  function handleRemove() {
    onselect(null);
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
  accept="image/*"
  class="hidden"
  bind:this={fileInput}
  onchange={handleInputChange}
/>

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
      <img src={value} alt={label} class="h-full w-full object-cover" />
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
                showPicker = true;
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
          showPicker = true;
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
          <span class="text-sm text-violet-400">Drop image here</span>
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
          <span class="text-sm text-gray-400">Click to select or drag image</span>
        {/if}
      </button>
    {/if}
  </div>
</div>

<!-- Media Picker Modal -->
{#if showPicker}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onclick={() => (showPicker = false)}
    onkeydown={(e) => e.key === 'Escape' && (showPicker = false)}
    role="dialog"
    aria-modal="true"
    aria-label="Select media"
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
        <h2 class="text-lg font-semibold text-white">Select Media</h2>
        <div class="flex items-center gap-3">
          <a
            href="/admin/media"
            target="_blank"
            class="text-sm text-violet-400 hover:text-violet-300"
          >
            Manage library
          </a>
          <button
            onclick={() => (showPicker = false)}
            class="text-gray-400 hover:text-white"
            aria-label="Close"
          >
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
            {isDragging ? 'Drop image here' : 'Drop image or'}
          </span>
          <button
            type="button"
            onclick={() => fileInput.click()}
            class="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Choose file
          </button>
        </div>

        {#if media.length === 0}
          <p class="py-4 text-center text-sm text-gray-500">No images in library yet</p>
        {:else}
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {#each visibleMedia as item (item.id)}
              <button
                type="button"
                onclick={() => handleSelect(item)}
                class="group relative aspect-square overflow-hidden rounded-lg ring-2 ring-transparent transition-all hover:ring-violet-500"
              >
                <img
                  src={item.thumbnailUrl || item.url}
                  alt={item.alt || item.filename}
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
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

<ImageModal
  file={pendingFile}
  {shapes}
  {defaultShape}
  onconfirm={handleCropConfirm}
  oncancel={handleCropCancel}
/>
