<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { formatDuration } from '$lib/utils/upload';
  import { CLIP_STATUS_LABELS, type ClipStatus } from '$lib/clips/types';
  import { SelectCheckbox, SelectionToolbar } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import type { PageData } from './$types';
  import { createProject, deleteProject } from './data.remote';

  let { data }: { data: PageData } = $props();

  let creating = $state(false);

  /** The order a clip moves through the pipeline, which is also tab order. */
  const STATUS_ORDER: ClipStatus[] = [
    'draft',
    'rendered',
    'review',
    'approved',
    'rejected',
    'queued',
    'published'
  ];

  let statusFilter = $state<ClipStatus | 'all'>('all');

  const statusCounts = $derived(
    data.projects.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {})
  );

  /**
   * Only statuses that currently have clips get a tab. Media can show all its
   * roles and grey out the empty ones because there are four of them; seven
   * mostly-empty tabs would be a longer row than the grid they filter.
   */
  const statusTabs = $derived<{ key: ClipStatus | 'all'; label: string; count: number }[]>([
    { key: 'all', label: 'All', count: data.projects.length },
    ...STATUS_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0).map((status) => ({
      key: status,
      label: CLIP_STATUS_LABELS[status],
      count: statusCounts[status]
    }))
  ]);

  const shownProjects = $derived(
    statusFilter === 'all' ? data.projects : data.projects.filter((p) => p.status === statusFilter)
  );

  // No pagination here, so whatever the filter shows is the selection scope.
  const selection = new Selection();

  /**
   * deleteProject takes the render, sources, jobs and upload sessions with it,
   * so this needs no cleanup of its own.
   */
  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} clip${count > 1 ? 's' : ''} and their rendered video?`)) return;

    for (const id of selection.ids) {
      await deleteProject(id);
    }
    await invalidateAll();
    toast.success(`Deleted ${count} clip${count > 1 ? 's' : ''}`);
    selection.clear();
  }

  const STATUS_STYLES: Record<ClipStatus, string> = {
    draft: 'bg-gray-700 text-gray-300',
    rendered: 'bg-sky-900 text-sky-300',
    review: 'bg-amber-900 text-amber-300',
    approved: 'bg-emerald-900 text-emerald-300',
    rejected: 'bg-red-900 text-red-300',
    queued: 'bg-violet-900 text-violet-300',
    published: 'bg-gray-800 text-gray-400'
  };

  const mediaById = $derived(new Map(data.media.map((m) => [m.id, m])));

  const sourceCounts = $derived(
    data.sources.reduce<Record<number, number>>((acc, s) => {
      acc[s.projectId] = (acc[s.projectId] ?? 0) + 1;
      return acc;
    }, {})
  );

  /**
   * Creates a clip and goes straight to it. The name is a placeholder rather
   * than a prompt — naming a clip before you've seen a frame of it is guesswork,
   * and it's editable at the top of the editor.
   */
  async function handleCreate() {
    creating = true;
    try {
      const result = await createProject({ name: 'Untitled clip' });
      await goto(`/admin/clips/${result.project.id}`);
    } catch {
      toast.error('Could not create the clip');
    } finally {
      creating = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-950 p-6">
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold text-white">Clips</h1>
      <p class="text-sm text-gray-500">Turn raw footage into branded, post-ready vertical video</p>
    </div>
    <button
      onclick={handleCreate}
      disabled={creating}
      class="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      {creating ? 'Creating…' : 'New clip'}
    </button>
  </header>

  {#if !data.renderingAvailable}
    <div class="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm">
      <p class="font-medium text-amber-300">Rendering is unavailable</p>
      <p class="mt-1 text-amber-200/70">
        ffmpeg isn't installed on the server, so clips can't be rendered here.
      </p>
    </div>
  {/if}

  {#if data.projects.length === 0}
    <div class="rounded-xl border border-dashed border-gray-700 py-16 text-center">
      <p class="mb-2 text-lg font-medium text-gray-400">No clips yet</p>
      <p class="mb-4 text-sm text-gray-500">
        Start one, add footage from your library or straight off a phone, and render it.
      </p>
      <button
        onclick={handleCreate}
        disabled={creating}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
      >
        Create your first clip
      </button>
    </div>
  {:else}
    <!-- Same row as the media library: filters left, bulk actions right. -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-1.5">
        {#each statusTabs as tab (tab.key)}
          <button
            onclick={() => {
              statusFilter = tab.key;
              selection.clear();
            }}
            class="rounded-lg px-3 py-1.5 text-sm transition-colors {statusFilter === tab.key
              ? 'bg-violet-600 text-white'
              : 'border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}"
          >
            {tab.label}
            <span class="ml-1 tabular-nums opacity-60">{tab.count}</span>
          </button>
        {/each}
      </div>

      <SelectionToolbar
        count={selection.size}
        allSelected={selection.covers(shownProjects)}
        onToggleAll={() => selection.toggleAll(shownProjects)}
        onDelete={deleteSelected}
        onClear={() => selection.clear()}
      />
    </div>

    <!-- One step denser than the media library at each width: these cards are
         3:4 rather than square, so the same column count reads much taller. -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {#each shownProjects as project (project.id)}
        {@const output = project.outputMediaId ? mediaById.get(project.outputMediaId) : undefined}
        <!-- The checkbox sits beside the link rather than inside it: a button
             nested in an anchor is invalid, and as a sibling it needs no
             click-cancelling to keep from navigating. -->
        <div
          class="group relative overflow-hidden rounded-xl bg-gray-800 {selection.has(project.id)
            ? 'ring-2 ring-violet-500'
            : ''}"
        >
          <SelectCheckbox
            checked={selection.has(project.id)}
            onclick={() => selection.toggle(project.id)}
          />
          <a href="/admin/clips/{project.id}" class="block">
            <!-- Clips are vertical far more often than not, so the card is too,
                 and the poster covers it. A grid of letterboxed thumbnails
                 reads as empty space; the crop still shows enough to tell one
                 clip from another, which is all this view is for. -->
            <div class="aspect-[3/4] bg-gray-900">
              {#if output?.thumbnailUrl}
                <img
                  src={output.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  class="h-full w-full object-cover"
                />
              {:else}
                <div
                  class="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-700"
                >
                  <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                    />
                  </svg>
                  <span class="text-xs">Not rendered</span>
                </div>
              {/if}
            </div>

            {#if output?.durationMs}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums"
              >
                {formatDuration(output.durationMs)}
              </span>
            {/if}

            <div class="p-3">
              <p class="truncate text-sm text-white group-hover:text-violet-300">{project.name}</p>
              <div class="mt-1.5 flex items-center gap-2">
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-medium {STATUS_STYLES[
                    project.status as ClipStatus
                  ] ?? 'bg-gray-700 text-gray-300'}"
                >
                  {CLIP_STATUS_LABELS[project.status as ClipStatus] ?? project.status}
                </span>
                <span class="text-xs text-gray-500">
                  {sourceCounts[project.id] ?? 0} source{(sourceCounts[project.id] ?? 0) === 1
                    ? ''
                    : 's'}
                </span>
              </div>
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Release queue -->
  {#if data.queue.length > 0}
    <section class="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-4">
        <h2 class="text-sm font-medium tracking-wider text-gray-400 uppercase">Release queue</h2>
        <p class="mt-1 text-xs text-gray-500">
          {#if data.publishConfigured}
            Releases fire automatically at the configured hour.
          {:else}
            No publish webhook set — nothing will fire automatically.
          {/if}
        </p>
      </div>
      <ol class="space-y-2">
        {#each data.queue as entry, index (entry.project.id)}
          <li
            class="flex items-center gap-3 rounded-lg bg-gray-800/50 px-3 py-2 text-sm transition-colors hover:bg-gray-800"
          >
            <span class="w-6 text-center text-xs text-gray-600">{index + 1}</span>
            <div class="h-10 w-7 shrink-0 overflow-hidden rounded bg-gray-800">
              {#if entry.output?.thumbnailUrl}
                <img src={entry.output.thumbnailUrl} alt="" class="h-full w-full object-cover" />
              {/if}
            </div>
            <a
              href="/admin/clips/{entry.project.id}"
              class="min-w-0 flex-1 truncate text-white transition-colors hover:text-violet-400"
            >
              {entry.project.name}
            </a>
            <span class="text-xs text-gray-500">
              {entry.eta ? new Date(entry.eta).toLocaleDateString() : 'paused'}
            </span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</div>
