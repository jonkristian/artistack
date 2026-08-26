<script lang="ts">
  import { CLIP_STATUS_LABELS, type ClipStatus } from '$lib/clips/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /**
   * Which button last copied, so only that one says so. One shared key rather
   * than a flag per button — copying a second thing should move the label, not
   * leave two buttons both claiming to be the clipboard.
   */
  let copiedKey = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout>;

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    copiedKey = key;
    clearTimeout(timer);
    timer = setTimeout(() => (copiedKey = null), 2000);
  }

  /**
   * What actually goes in a compose box: caption, hashtags, campaign link. The
   * post sheet has all three too, but wrapped in frontmatter you'd have to
   * delete by hand every time.
   */
  const forPosting = $derived(
    [data.caption, data.hashtags, data.ctaUrl].filter(Boolean).join('\n\n')
  );

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

  <!--
    Discord, Slack and iMessage render a playable video from these rather than a
    bare link. og:video must point at the file itself, not the page, and the
    dimensions are what stop the player being letterboxed into a 16:9 box.
  -->
  <meta property="og:type" content="video.other" />
  <meta property="og:site_name" content={data.artistName} />
  <meta property="og:title" content={data.project.name} />
  <meta property="og:url" content={data.pageUrl} />
  {#if data.project.description}
    <meta property="og:description" content={data.project.description} />
  {/if}
  {#if data.posterUrl}
    <meta property="og:image" content={data.posterUrl} />
  {/if}
  <meta property="og:video" content={data.videoUrl} />
  <meta property="og:video:secure_url" content={data.videoUrl} />
  <meta property="og:video:type" content="video/mp4" />
  {#if data.clip.width && data.clip.height}
    <meta property="og:video:width" content={String(data.clip.width)} />
    <meta property="og:video:height" content={String(data.clip.height)} />
  {/if}
  <meta name="twitter:card" content="player" />
</svelte:head>

<!-- One row of the post: its label, the text itself, and a copy for that piece
     alone — pasting a caption and hashtags separately is how most compose boxes
     want them anyway. -->
{#snippet part(key: string, label: string, text: string)}
  <div class="border-t border-gray-800 py-3 first:border-t-0 first:pt-0">
    <div class="mb-1 flex items-center justify-between gap-2">
      <span class="text-xs text-gray-500">{label}</span>
      <button
        onclick={() => copy(key, text)}
        class="shrink-0 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
      >
        {copiedKey === key ? 'Copied' : 'Copy'}
      </button>
    </div>
    <p class="text-sm break-words whitespace-pre-wrap text-gray-300">{text}</p>
  </div>
{/snippet}

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

    <!-- The page's job on a platform that can't be posted to from a workflow:
         hand over the pieces of the post one paste at a time. -->
    <section class="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-white">Ready to post</h2>
        <button
          onclick={() => copy('all', forPosting)}
          class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
        >
          {copiedKey === 'all' ? 'Copied' : 'Copy all'}
        </button>
      </div>

      {#if data.caption}
        {@render part('caption', 'Caption', data.caption)}
      {/if}
      {#if data.hashtags}
        {@render part('hashtags', 'Hashtags', data.hashtags)}
      {/if}
      {@render part('link', 'Link in post', data.ctaUrl)}
    </section>

    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-white">Post sheet</h2>
        <button
          onclick={() => copy('sheet', data.postSheet)}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          {copiedKey === 'sheet' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre class="overflow-auto text-xs whitespace-pre-wrap text-gray-400">{data.postSheet}</pre>
    </section>

    <p class="mt-8 text-center text-xs text-gray-600">
      Approval happens in Artistack. Send feedback to whoever shared this link.
    </p>
  </div>
</div>
