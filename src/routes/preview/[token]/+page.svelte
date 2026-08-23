<script lang="ts">
  import { CLIP_STATUS_LABELS, type ClipStatus } from '$lib/clips/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let copied = $state(false);

  function copySheet() {
    navigator.clipboard.writeText(data.postSheet);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const duration = $derived(
    data.clip.durationMs ? `${Math.round(data.clip.durationMs / 1000)}s` : ''
  );

  // Vertical clips need a height-constrained player or they run off the page.
  const isVertical = $derived(
    Boolean(data.clip.width && data.clip.height && data.clip.height > data.clip.width)
  );
</script>

<svelte:head>
  <title>{data.project.name} — {data.artistName}</title>
  <!-- Unlisted: keep it out of search results even if the link gets shared on. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-950 px-4 py-10 text-gray-100">
  <div class="mx-auto max-w-3xl">
    <header class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm text-gray-500">{data.artistName}</p>
        <h1 class="text-2xl font-semibold text-white">
          {data.project.name}
        </h1>
      </div>
      <span
        class="rounded-full px-3 py-1 text-xs font-medium"
        style="background-color: {data.accentColor}22; color: {data.accentColor}"
      >
        {CLIP_STATUS_LABELS[data.project.status as ClipStatus] ?? data.project.status}
      </span>
    </header>

    <div class="mb-6 flex justify-center rounded-xl bg-black p-2">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        src={data.clip.url}
        poster={data.clip.poster ?? undefined}
        controls
        playsinline
        class="rounded-lg {isVertical ? 'max-h-[70vh]' : 'w-full'}"
      ></video>
    </div>

    <p class="mb-8 text-center text-xs text-gray-600">
      {data.clip.width}×{data.clip.height}{duration ? ` · ${duration}` : ''} · unlisted preview
    </p>

    {#if data.project.description}
      <section class="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="mb-2 text-sm font-semibold text-white">Caption</h2>
        <p class="text-sm whitespace-pre-wrap text-gray-300">{data.project.description}</p>
      </section>
    {/if}

    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-white">Post sheet</h2>
        <button
          onclick={copySheet}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre class="overflow-auto text-xs whitespace-pre-wrap text-gray-400">{data.postSheet}</pre>
    </section>

    <p class="mt-8 text-center text-xs text-gray-600">
      Approval happens in Artistack. Send feedback to whoever shared this link.
    </p>
  </div>
</div>
