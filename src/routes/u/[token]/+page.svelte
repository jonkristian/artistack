<script lang="ts">
  import { isVideoFile, isAudioFile, formatDuration } from '$lib/utils/upload';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface Item {
    id: number;
    name: string;
    size: number;
    status: 'uploading' | 'done' | 'error';
    progress: number;
    message?: string;
    thumbnailUrl?: string;
    durationMs?: number;
  }

  let items = $state<Item[]>([]);
  let nextId = 0;
  let fileInput: HTMLInputElement;
  let cameraInput: HTMLInputElement;

  const uploading = $derived(items.some((i) => i.status === 'uploading'));
  const doneCount = $derived(items.filter((i) => i.status === 'done').length);

  const expiresIn = $derived.by(() => {
    const ms = new Date(data.expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const minutes = Math.ceil(ms / 60_000);
    return minutes > 60 ? `${Math.round(minutes / 60)}h` : `${minutes} min`;
  });

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /**
   * Uploads one file with real progress.
   *
   * XMLHttpRequest rather than fetch: phone clips are big and on a phone
   * network, and fetch still has no upload-progress event — without a moving
   * bar people assume it's stuck and navigate away mid-upload.
   */
  function upload(file: File, item: Item): Promise<void> {
    return new Promise((resolve) => {
      const streamed = isVideoFile(file) || isAudioFile(file);
      const url = streamed
        ? `/api/upload/stream?upload_token=${encodeURIComponent(data.token)}&filename=${encodeURIComponent(file.name)}`
        : `/api/upload?upload_token=${encodeURIComponent(data.token)}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        item.progress = Math.round((e.loaded / e.total) * 100);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText);
            item.thumbnailUrl = body.thumbnailUrl;
            item.durationMs = body.durationMs;
          } catch {
            // A success without parseable metadata is still a success.
          }
          item.status = 'done';
          item.progress = 100;
        } else {
          item.status = 'error';
          try {
            item.message = JSON.parse(xhr.responseText).message ?? 'Upload failed';
          } catch {
            item.message = `Upload failed (${xhr.status})`;
          }
        }
        resolve();
      };

      xhr.onerror = () => {
        item.status = 'error';
        item.message = 'Connection lost';
        resolve();
      };

      if (streamed) {
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('type', 'media');
        xhr.send(form);
      }
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    // One at a time: a phone uploading four clips in parallel over mobile data
    // just makes all four slower and every progress bar meaningless.
    for (const file of Array.from(files)) {
      items.push({
        id: nextId++,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0
      });

      // Hand `upload` the proxied element, not the object literal above.
      // Writing to the raw object would update the value but never notify
      // Svelte, so the progress bar would sit at 0 for the whole upload.
      await upload(file, items[items.length - 1]);
    }
  }
</script>

<svelte:head>
  <title>Upload — {data.artistName}</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="min-h-screen bg-gray-950 px-4 py-6 text-gray-100">
  <div class="mx-auto max-w-md">
    <header class="mb-6 text-center">
      <p class="text-sm text-gray-500">{data.artistName}</p>
      <h1 class="text-xl font-semibold text-white">
        {data.label || 'Upload media'}
      </h1>
      {#if data.projectName}
        <p class="mt-1 text-sm" style="color: {data.accentColor}">
          Adds to “{data.projectName}”
        </p>
      {/if}
      <p class="mt-2 text-xs text-gray-600">Link expires in {expiresIn}</p>
    </header>

    {#if !data.videoAccepted}
      <div
        class="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-200"
      >
        This server can't accept video right now. Photos still work.
      </div>
    {/if}

    <!-- Big targets: this is used one-handed, often outdoors. -->
    <div class="space-y-3">
      <button
        type="button"
        onclick={() => cameraInput.click()}
        disabled={uploading}
        class="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-5 text-base font-medium text-white transition-opacity disabled:opacity-50"
        style="background-color: {data.accentColor}"
      >
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        Record a video
      </button>

      <button
        type="button"
        onclick={() => fileInput.click()}
        disabled={uploading}
        class="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-700 bg-gray-900 px-4 py-5 text-base font-medium text-gray-200 disabled:opacity-50"
      >
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        Choose from library
      </button>
    </div>

    <input
      bind:this={cameraInput}
      type="file"
      accept="video/*"
      capture="environment"
      class="hidden"
      onchange={(e) => {
        handleFiles(e.currentTarget.files);
        e.currentTarget.value = '';
      }}
    />
    <input
      bind:this={fileInput}
      type="file"
      accept="video/*,image/*,audio/*"
      multiple
      class="hidden"
      onchange={(e) => {
        handleFiles(e.currentTarget.files);
        e.currentTarget.value = '';
      }}
    />

    {#if items.length > 0}
      <div class="mt-6">
        <p class="mb-2 text-xs text-gray-500">
          {doneCount} of {items.length} uploaded
        </p>
        <ul class="space-y-2">
          {#each items as item (item.id)}
            <li class="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div class="flex items-center gap-3">
                <div class="h-12 w-9 shrink-0 overflow-hidden rounded bg-gray-800">
                  {#if item.thumbnailUrl}
                    <img src={item.thumbnailUrl} alt="" class="h-full w-full object-cover" />
                  {/if}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-white">{item.name}</p>
                  <p class="text-xs text-gray-500">
                    {formatSize(item.size)}
                    {#if item.durationMs}
                      · {formatDuration(item.durationMs)}
                    {/if}
                  </p>
                </div>
                {#if item.status === 'done'}
                  <svg
                    class="h-5 w-5 shrink-0 text-emerald-400"
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
                {:else if item.status === 'uploading'}
                  <span class="shrink-0 text-xs text-gray-400 tabular-nums">{item.progress}%</span>
                {/if}
              </div>

              {#if item.status === 'uploading'}
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    class="h-full transition-all"
                    style="width: {item.progress}%; background-color: {data.accentColor}"
                  ></div>
                </div>
              {:else if item.status === 'error'}
                <p class="mt-2 text-xs text-red-400">{item.message}</p>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if doneCount > 0 && !uploading}
      <p class="mt-6 text-center text-sm text-gray-500">
        Done — {doneCount}
        {doneCount === 1 ? 'file is' : 'files are'} in the library. You can close this page.
      </p>
    {/if}
  </div>
</div>
