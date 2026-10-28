<script lang="ts">
  /**
   * The Send column: where the clip stands, what the post will look like, what
   * it says, and the two ways it leaves.
   *
   * Moved out of the clip page unchanged. Nothing in here makes the file —
   * rendering is a button on the Full picture, beside the thing it makes — and
   * nothing in here talks to the server: the one write it needs, the queue
   * gap, is handed in, so the page stays the only place that saves.
   */
  import { Icon, type IconSource } from 'svelte-hero-icons';
  import PostPreview from '$lib/components/clips/PostPreview.svelte';
  import { labelClass, numberClass } from '$lib/utils/classes';
  import { socialIcons } from '$lib/blocks/utils';
  import { CLIP_STATUS_DOTS, PLATFORM_NAMES } from '$lib/clips/types';
  import type { ClipRenderConfig, ClipStatus } from '$lib/clips/types';

  let {
    selected,
    config,
    look,
    outputMedia,
    statusLine,
    tagNames,
    job,
    canSendForReview,
    canSchedule,
    sendAction,
    locale,
    account,
    posts,
    onqueuegap,
    onpreviewlink,
    onunqueue,
    queueDialogOpen = $bindable(false),
    reviewConfirmOpen = $bindable(false)
  }: {
    selected: Record<string, any> & { status: ClipStatus };
    config: ClipRenderConfig;
    look: { frame: { width: number; height: number } };
    outputMedia: { url: string; thumbnailUrl?: string | null } | null | undefined;
    statusLine: string;
    tagNames: string[];
    job: { status?: string; message?: string | null; error?: string | null } | null;
    canSendForReview: boolean;
    canSchedule: boolean;
    /** The shared look of the column's two verbs. */
    sendAction: string;
    locale: string;
    /** Whose account the post goes out as, for the preview's byline. */
    account: string;
    /** What has already gone out, and where. */
    posts: {
      id: number;
      platform: string;
      status: string;
      url?: string | null;
      error?: string | null;
    }[];
    onqueuegap: (days: number | null) => void;
    onpreviewlink: (fresh: boolean) => void;
    onunqueue: () => void;
    queueDialogOpen?: boolean;
    reviewConfirmOpen?: boolean;
  } = $props();
</script>

<!-- Read top to bottom, in the order the job is done: where the
     clip stands, what the post will look like, what it says in
     words, and then the two ways it leaves.

     Nothing here makes the file. Rendering is a button on the
     Full picture, beside the thing it makes; deleting is at the
     foot of the rail, nowhere near anything you reach for. What
     is left is sending, which is what the word says. -->
<div class="flex flex-1 flex-col gap-3">
  <!-- Only a status worth hearing.
       "Rendered and ready to send out" was the one this line
       could never tell you anything by saying: there is a render
       in the pane and a button offering another, so it restated
       the room it was standing in. Sent, queued, published —
       those happened somewhere else and are invisible from here
       otherwise. -->
  {#if outputMedia && selected.status !== 'rendered'}
    <div class="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <span class="h-2 w-2 shrink-0 rounded-full {CLIP_STATUS_DOTS[selected.status]}"></span>
      <span class="min-w-0 flex-1 text-sm text-gray-300">{statusLine}</span>
    </div>
  {/if}

  <!-- What it will look like, before what it says in words.
       The sheet below answers "what do I paste where"; this
       answers the question you have before sending anything out
       — what will people see. Chiefly two things no list of
       fields can show: whether the first frame is black, since
       every platform takes it as the cover, and where the
       caption gets cut. -->
  <PostPreview
    poster={outputMedia?.thumbnailUrl ?? null}
    aspect={config.aspect === '1:1' ? '1/1' : config.aspect === '16:9' ? '16/9' : '9/16'}
    name={account}
    description={selected.description ?? ''}
    tags={tagNames}
  />

  {#if canSendForReview}
    <button
      onclick={() => (reviewConfirmOpen = true)}
      title={selected.status === 'review' ? 'Send it again' : 'Send it for approval'}
      aria-label={selected.status === 'review' ? 'Re-send for review' : 'Send for review'}
      class="{sendAction} light:text-teal-700 light:hover:text-white border border-teal-500/40 bg-teal-500/10 text-teal-300 transition-colors hover:border-teal-600 hover:bg-teal-600 hover:text-white"
    >
      <!-- Discord's own mark, from the set the site's links use.
     A tick in a circle said "approved", which is the thing this
     button asks for rather than the thing it does — and the word
     Review on its own left out where it goes. -->
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d={socialIcons.discord} />
      </svg>
      {selected.status === 'review' ? 'Send to Discord again' : 'Send for review'}
    </button>
  {/if}
  {#if canSchedule}
    <button
      onclick={() => (queueDialogOpen = true)}
      class="{sendAction} bg-violet-600 text-white hover:bg-violet-500"
    >
      Schedule release
    </button>
  {/if}
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
  {#if outputMedia}
    {#if posts.length > 0}
      <ul class="mb-4 space-y-1.5">
        {#each posts as post (post.id)}
          <li class="flex items-center gap-2 text-xs">
            <span
              class="rounded px-1.5 py-0.5 font-medium {post.status === 'live'
                ? 'light:bg-emerald-100 light:text-emerald-800 bg-emerald-900 text-emerald-300'
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
                class="text-link hover:text-link-strong truncate">View post</a
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
    {#if selected.reviewNote}
      <p class="mb-4 rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-400">
        <span class="text-gray-500">Note:</span>
        {selected.reviewNote}
      </p>
    {/if}
    {#if selected.previewToken}
      <div class="mt-3 flex items-center gap-1 rounded-lg bg-gray-950 py-1 pr-1 pl-3">
        <a
          href="/preview/{selected.previewToken}"
          target="_blank"
          rel="noreferrer"
          class="text-link hover:text-link-strong min-w-0 flex-1 truncate py-1 text-xs"
        >
          /preview/{selected.previewToken}
        </a>
        {@render linkAction(
          () => onpreviewlink(false),
          'Copy preview link',
          'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
        )}
        {@render linkAction(
          () => onpreviewlink(true),
          'Invalidate this link and create a new one',
          'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
        )}
        {#if outputMedia}
          <a
            href={outputMedia.url}
            download
            title="Download video"
            aria-label="Download video"
            class="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50"
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
              ? new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  hour12: false
                }).format(new Date(selected.scheduledFor))
              : 'Next available slot'}
            <button
              onclick={() => (queueDialogOpen = true)}
              class="text-link hover:text-link-strong whitespace-nowrap"
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
              onblur={(e) => {
                const raw = e.currentTarget.value;
                onqueuegap(raw === '' ? null : Number(raw));
              }}
            />
          </div>
        {/if}
        <button
          onclick={onunqueue}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 hover:bg-gray-700"
        >
          Remove from queue
        </button>
      </div>
    {/if}
  {/if}
</div>

<!-- A switch in the transport row: on or off, pressed while watching.
     Two of them because some states are a shape nobody has drawn an icon for —
     a fade is two triangles — and the rest are in the icon set. Same size,
     same states, so the row reads as one row. -->
{#snippet toggle(label: string, on: boolean, act: () => void, d: string)}
  <button
    type="button"
    onclick={act}
    title={label}
    aria-label={label}
    aria-pressed={on}
    class="flex h-7 w-7 items-center justify-center rounded transition-colors {on
      ? 'bg-gray-50 text-gray-950'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-50'}"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path {d} fill="currentColor" />
    </svg>
  </button>
{/snippet}

{#snippet toggleIcon(label: string, on: boolean, act: () => void, src: IconSource)}
  <button
    type="button"
    onclick={act}
    title={label}
    aria-label={label}
    aria-pressed={on}
    class="flex h-7 w-7 items-center justify-center rounded transition-colors {on
      ? 'bg-gray-50 text-gray-950'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-50'}"
  >
    <Icon {src} size="16" solid />
  </button>
{/snippet}

{#snippet linkAction(onclick: () => void, label: string, path: string)}
  <button
    type="button"
    {onclick}
    title={label}
    aria-label={label}
    class="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50"
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={path} />
    </svg>
  </button>
{/snippet}
