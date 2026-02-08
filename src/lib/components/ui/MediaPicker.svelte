<script lang="ts">
  import type { Media } from '$lib/server/schema';
  import { ImageModal, type Shape } from '$lib/components/dialogs';
  import { addMedia } from '../../../routes/admin/media/data.remote';
  import { invalidateAll } from '$app/navigation';

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
    open = $bindable(false)
  }: Props = $props();

  let showPicker = $state(false);
  let pendingFile = $state<File | null>(null);
  let originalFile = $state<File | null>(null);
  let uploading = $state(false);
  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  // In multi mode, internal selection state (copy of selectedIds to allow cancel)
  let multiSelection = $state<number[]>([]);

  // Sync open prop to showPicker for multi mode
  $effect(() => {
    if (multiple && open) {
      multiSelection = [...selectedIds];
      showPicker = true;
    }
  });

  $effect(() => {
    if (multiple && !showPicker) {
      open = false;
    }
  });

  // Pagination
  const perPage = 12;
  let currentPage = $state(1);
  const totalPages = $derived(Math.ceil(media.length / perPage));
  const visibleMedia = $derived(media.slice((currentPage - 1) * perPage, currentPage * perPage));

  function isValidImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }

  async function handleFileUpload(file: File) {
    if (!isValidImageFile(file)) {
      alert('Please select an image file');
      return;
    }

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
      }
    } finally {
      uploading = false;
    }
  }

  async function handleFileSelect(file: File) {
    if (!isValidImageFile(file)) {
      alert('Please select an image file');
      return;
    }

    // In multi mode, just upload to library (no crop, no auto-select)
    if (multiple) {
      await handleFileUpload(file);
      return;
    }

    showPicker = false;

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
          if (onselect) onselect(url);
        }
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
    const file = input.files?.[0];
    if (file) {
      handleFileSelect(file);
      input.value = '';
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
    showPicker = false;
    originalFile = null;

    if (noCrop) {
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
    showPicker = false;
  }

  function handleClose() {
    showPicker = false;
  }

  async function handleCropConfirm(croppedFile: File, selectedShape: Shape) {
    const fileToAddToLibrary = originalFile;
    pendingFile = null;
    originalFile = null;
    uploading = true;

    try {
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
          await invalidateAll();
        }
      }

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
      if (onselect) onselect(url, selectedShape);
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
  accept="image/*"
  class="hidden"
  bind:this={fileInput}
  onchange={handleInputChange}
/>

<!-- Single mode: inline preview/trigger area -->
{#if !multiple}
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
{/if}

<!-- Media Picker Modal -->
{#if showPicker}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label={multiple ? `Select images (${multiSelection.length} selected)` : 'Select media'}
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
            Select images ({multiSelection.length} selected)
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
          <button
            onclick={handleClose}
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

        {#if media.length === 0}
          <p class="py-4 text-center text-sm text-gray-500">No images in library yet</p>
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
                    : 'ring-transparent opacity-60 hover:opacity-100'
                  : 'ring-transparent hover:ring-violet-500'}"
              >
                <img
                  src={item.thumbnailUrl || item.url}
                  alt={item.alt || item.filename}
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
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
