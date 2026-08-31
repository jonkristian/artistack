<script lang="ts">
  import { fieldClass, labelClass, tileGridClass } from '$lib/utils/classes';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { SectionCard } from '$lib/components/cards';
  import { LibraryToolbar, SelectCheckbox, DateTimePicker } from '$lib/components/ui';
  import { Selection } from '$lib/utils/selection.svelte';
  import { tick } from 'svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData, type UnifiedDraftData } from '../publishDraft';
  import { createShow, deleteShow } from '../data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const draftData = draft.getData<UnifiedDraftData>();

  const today = new Date().toISOString().split('T')[0];

  /*
   * What's coming, soonest first, then what's been — most recent first. One
   * list rather than two sections: the toolbar filters upcoming from past, the
   * same way Releases filters draft from out, so a second heading would say
   * what the filter already says.
   */
  const ordered = $derived([
    ...(draftData.shows ?? [])
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)),
    ...(draftData.shows ?? [])
      .filter((s) => s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))
  ]);

  /*
   * A show needs a venue and a date before it exists — those are what it is,
   * and the row can't be written without them. Everything else lives on the
   * show's own page, so this asks the least it can and gets out of the way.
   */
  let creating = $state(false);
  let saving = $state(false);
  let venueName = $state('');
  let venueCity = $state('');
  let date = $state('');

  function reset() {
    creating = false;
    venueName = '';
    venueCity = '';
    date = '';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;

    saving = true;
    try {
      const result = await createShow({
        date,
        venue: { name: venueName.trim(), city: venueCity.trim() }
      });
      await invalidateAll();
      await tick();
      /*
       * The layout seeds the draft once, when it mounts, so a show created
       * after that isn't in it — and its editor would have nothing to bind to.
       */
      draft.initialize(buildDraftFromServerData(data));
      reset();
      await goto(`/admin/shows/${result.show.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the show');
    } finally {
      saving = false;
    }
  }

  const formatDate = $derived(
    new Intl.DateTimeFormat(data.settings?.locale || 'nb-NO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  );

  /**
   * Status is derived, not stored: a show is upcoming until its date passes.
   * Two exclusive states, so they filter cleanly — the same shape as a
   * release's draft/upcoming/out.
   */
  function statusOf(show: { date: string }): string {
    return show.date >= today ? 'upcoming' : 'past';
  }

  let statusFilter = $state<string[]>([]);

  const allShows = $derived(ordered);

  const statusOptions = $derived(
    [
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'past', label: 'Past' }
    ].map((option) => ({
      ...option,
      count: allShows.filter((s) => statusOf(s) === option.key).length
    }))
  );

  const shown = $derived(
    statusFilter.length === 0
      ? allShows
      : allShows.filter((s) => statusFilter.includes(statusOf(s)))
  );

  const selection = new Selection();

  // Names for the tile footer. The draft carries ids; the act table is in
  // layout data, so this resolves without another query.
  const actsById = $derived(new Map((data.acts ?? []).map((b) => [b.id, b])));

  function lineupOf(show: { lineup?: { actId: number }[] }): string[] {
    return (show.lineup ?? [])
      .map((entry) => actsById.get(entry.actId)?.name)
      .filter((n): n is string => !!n);
  }

  /**
   * Immediate rather than staged, like every other delete in the admin: it
   * removes rows the draft is holding, so it re-seeds the draft after.
   */
  async function deleteSelected() {
    const count = selection.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} show${count > 1 ? 's' : ''}?`)) return;

    for (const id of selection.ids) {
      await deleteShow(id);
    }
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
    toast.info(`Deleted ${count} show${count > 1 ? 's' : ''}`);
    selection.clear();
  }
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <LibraryToolbar
    options={statusOptions}
    bind:selected={statusFilter}
    total={allShows.length}
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
          New show
        </button>
      {/if}
    {/snippet}
  </LibraryToolbar>

  {#if creating}
    <div class="mb-4">
      <SectionCard title="New show">
        <form onsubmit={submit} class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label for="new-venue" class={labelClass}>Venue</label>
              <input
                id="new-venue"
                type="text"
                bind:value={venueName}
                placeholder="Kvarteret"
                class={fieldClass}
                required
              />
            </div>
            <div>
              <label for="new-city" class={labelClass}>City</label>
              <input
                id="new-city"
                type="text"
                bind:value={venueCity}
                placeholder="Bergen"
                class={fieldClass}
                required
              />
            </div>
            <div>
              <span class={labelClass}>Date</span>
              <DateTimePicker
                mode="date"
                compact
                value={date}
                locale={data.settings?.locale || 'nb-NO'}
                onchange={(v) => (date = v)}
              />
            </div>
          </div>

          <div class="flex gap-2">
            <button
              type="submit"
              disabled={saving || !venueName.trim() || !venueCity.trim() || !date}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create show'}
            </button>
            <button
              type="button"
              onclick={reset}
              class="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  {/if}

  {#if allShows.length === 0 && !creating}
    <div class="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <p class="text-sm text-gray-400">No shows yet.</p>
      <p class="mt-1 text-xs text-gray-600">
        Add one, then put a Shows block on any page to list them.
      </p>
    </div>
  {/if}

  {#if shown.length > 0}
    <div class={tileGridClass}>
      {#each shown as show (show.id)}
        {@const isPast = show.date < today}
        <!-- The checkbox is a sibling of the link, not inside it: a button
             nested in an anchor is invalid markup. -->
        <div
          class="group relative overflow-hidden rounded-xl bg-gray-800 {selection.has(show.id)
            ? 'ring-2 ring-violet-500'
            : ''}"
        >
          <SelectCheckbox
            checked={selection.has(show.id)}
            onclick={() => selection.toggle(show.id)}
          />
          <a href="/admin/shows/{show.id}" class="block">
            <!-- 4/5, because a gig poster is portrait. Releases crop square to
                 their sleeve and clips 3/4 to the video; the shape follows the
                 artwork in each case.

                 A show that's been is dimmed rather than hidden: it's still
                 yours to edit, but it isn't work waiting to be done. -->
            <div class="aspect-[4/5] bg-gray-900 {isPast ? 'opacity-50' : ''}">
              {#if show.imageUrl}
                <!-- Cropped, like a release cover and a clip frame. A
                     thumbnail is for recognising the show, not for reading the
                     poster — and letterboxing one at this size reads as a
                     broken image rather than a considerate one. The poster is
                     shown whole on the show's own page. -->
                <img src={show.imageUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
              {:else}
                <div
                  class="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-700"
                >
                  <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span class="text-xs">No poster</span>
                </div>
              {/if}
            </div>

            {#if isPast}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-400 uppercase"
              >
                Past
              </span>
            {:else if show.soldOut}
              <span
                class="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase"
              >
                Sold out
              </span>
            {/if}

            <div class="p-3 {isPast ? 'opacity-60' : ''}">
              <h2 class="truncate text-sm font-medium text-white">{show.venue.name}</h2>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                {formatDate.format(new Date(show.date))}{#if show.venue.city}{' · '}{show.venue
                    .city}{/if}
              </p>
              {#if lineupOf(show).length > 0}
                <p class="mt-0.5 truncate text-[11px] text-gray-600">
                  {lineupOf(show).join(' · ')}
                </p>
              {/if}
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}
</div>
