<script lang="ts">
  import { fieldClass, labelClass, tileGridClass } from '$lib/utils/classes';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { toast } from '$lib/stores/toast.svelte';
  import { slugify } from '$lib/utils/slug';
  import { SectionCard } from '$lib/components/cards';
  import { LibraryToolbar, SelectCheckbox, DateTimePicker } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData, fromDateInput, type UnifiedDraftData } from '../publishDraft';
  import type { Link } from '$lib/server/schema';
  import { tick } from 'svelte';
  import { createRelease, deleteRelease } from './data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * Opened by ?new=1 so the dashboard's "New release" lands on the form rather
   * than on the list with the form still shut. Read once, not as an effect: it
   * describes how you arrived, and shouldn't reopen the form if you close it
   * and the URL hasn't changed.
   */
  let creating = $state($page.url.searchParams.get('new') === '1');
  let saving = $state(false);
  let title = $state('');
  let releaseDate = $state('');
  let slug = $state('');

  // The slug follows the title until it's edited by hand, then stops — the same
  // behaviour every CMS has, and the reason is that a slug quietly rewriting
  // itself after you've set it is how you end up with a dead link.
  let slugTouched = $state(false);
  const slugPreview = $derived(slugify(slugTouched && slug ? slug : title));

  function reset() {
    creating = false;
    title = '';
    releaseDate = '';
    slug = '';
    slugTouched = false;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    saving = true;

    try {
      const result = await createRelease({
        title,
        slug: slugPreview,
        releaseDate
      });
      await invalidateAll();
      await tick();
      /*
       * The layout seeds the draft once, when it mounts, so a release created
       * after that isn't in it — and its editor would have nothing to bind to.
       * Re-seeding here is what the dashboard does after setup adds blocks.
       */
      draft.initialize(buildDraftFromServerData(data));
      toast.info(`“${title}” created`);
      reset();
      await goto(`/admin/releases/${result.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the release');
    }

    saving = false;
  }

  function formatDate(value: string): string {
    const date = fromDateInput(value);
    if (!date) return value;
    return new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  const draftData = draft.getData<UnifiedDraftData>();

  // Straight off the draft, so a renamed release shows its new title here
  // before it's published — and its link count includes staged links.
  const releases = $derived(draftData.releases ?? []);
  const linkCounts = $derived(
    (draftData.links ?? []).reduce<Record<number, number>>((counts, link: Link) => {
      if (link.releaseId != null) counts[link.releaseId] = (counts[link.releaseId] ?? 0) + 1;
      return counts;
    }, {})
  );

  const now = Date.now();

  /**
   * Status is derived, not stored: a release is a draft until its page is
   * published, then it's upcoming until its date passes. Three exclusive
   * states, so they filter cleanly.
   */
  function statusOf(release: { published: boolean; releaseDate: string }): string {
    if (!release.published) return 'draft';
    return (fromDateInput(release.releaseDate)?.getTime() ?? 0) <= now ? 'out' : 'upcoming';
  }

  let statusFilter = $state<string[]>([]);

  const statusOptions = $derived(
    [
      { key: 'draft', label: 'Draft' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'out', label: 'Out' }
    ].map((option) => ({
      ...option,
      count: releases.filter((r) => statusOf(r) === option.key).length
    }))
  );

  const shown = $derived(
    statusFilter.length === 0
      ? releases
      : releases.filter((r) => statusFilter.includes(statusOf(r)))
  );

  const selection = new Selection();

  /**
   * Deleting a release takes its page and its links with it, so this needs no
   * cleanup of its own — same as deleting a clip takes its render.
   *
   * Immediate rather than staged, like every other delete in the admin: it
   * removes rows the draft is holding, so it has to re-seed the draft after.
   */
  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} release${count > 1 ? 's' : ''} and their pages?`)) return;

    for (const id of selection.ids) {
      await deleteRelease({ id });
    }
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
    toast.info(`Deleted ${count} release${count > 1 ? 's' : ''}`);
    selection.clear();
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <LibraryToolbar
    options={statusOptions}
    bind:selected={statusFilter}
    total={releases.length}
    onFilterChange={() => selection.clear()}
    count={selection.size}
    allSelected={selection.covers(shown)}
    onToggleAll={() => selection.toggleAll(shown)}
    onDelete={deleteSelected}
    onClear={() => selection.clear()}
  >
    {#snippet actions()}
      {#if !creating}
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition hover:bg-violet-500"
          onclick={() => (creating = true)}
        >
          New release
        </button>
      {/if}
    {/snippet}
  </LibraryToolbar>

  {#if creating}
    <div class="mb-6">
      <SectionCard title="New release">
        <form onsubmit={submit} aria-label="New release">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class={labelClass} for="release-title">Title</label>
              <input
                id="release-title"
                class={fieldClass}
                bind:value={title}
                placeholder="I Will Be Me"
                required
              />
            </div>
            <div>
              <span class={labelClass}>Release date</span>
              <DateTimePicker
                mode="date"
                compact
                value={releaseDate}
                locale={data.settings?.locale || 'nb-NO'}
                onchange={(v) => (releaseDate = v)}
              />
            </div>
          </div>

          <div class="mt-4">
            <label class={labelClass} for="release-slug">Address</label>
            <input
              id="release-slug"
              class={fieldClass}
              value={slugTouched ? slug : slugPreview}
              oninput={(e) => {
                slugTouched = true;
                slug = e.currentTarget.value;
              }}
              placeholder="i-will-be-me"
            />
            <p class="mt-1 text-xs text-gray-500">
              The page will live at <span class="font-mono text-gray-400"
                >/{slugPreview || '…'}</span
              >
            </p>
          </div>

          <div class="mt-5 flex items-center gap-2">
            <button
              type="submit"
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
              disabled={saving || !title || !releaseDate}
            >
              {saving ? 'Creating…' : 'Create release'}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-white"
              onclick={reset}
            >
              Cancel
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  {/if}

  {#if releases.length === 0}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">No releases yet.</p>
      <p class="mt-1 text-xs text-gray-600">
        Create one to get a shareable page with per-platform click tracking.
      </p>
    </div>
  {:else}
    <div class={tileGridClass}>
      {#each shown as release (release.id)}
        {@const isOut = (fromDateInput(release.releaseDate)?.getTime() ?? 0) <= now}
        {@const count = linkCounts[release.id] ?? 0}
        <!-- The checkbox is a sibling of the link, not inside it: a button
             nested in an anchor is invalid markup. -->
        <div
          class="group relative overflow-hidden rounded-xl bg-gray-800 {selection.has(release.id)
            ? 'ring-2 ring-violet-500'
            : ''}"
        >
          <SelectCheckbox
            checked={selection.has(release.id)}
            onclick={() => selection.toggle(release.id)}
          />
          <a href="/admin/releases/{release.id}" class="block">
            <!-- Square, because cover art is. Clips crop to 3/4 because clips
                 are vertical; the shape follows the artwork in both cases. -->
            <div class="aspect-square bg-gray-900">
              {#if release.coverUrl}
                <img
                  src={release.coverUrl}
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
                      d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span class="text-xs">No cover</span>
                </div>
              {/if}
            </div>

            {#if !release.published}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase"
              >
                Draft
              </span>
            {/if}

            <div class="p-3">
              <h2 class="truncate text-sm font-medium text-white">{release.title}</h2>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                {formatDate(release.releaseDate)} · {count}
                {count === 1 ? 'link' : 'links'}
              </p>
              <p class="mt-0.5 truncate text-[11px] text-gray-600">
                {isOut ? 'Out' : 'Upcoming'}
              </p>
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}
</div>
