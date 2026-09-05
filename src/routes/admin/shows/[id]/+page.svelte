<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import {
    ToggleSwitch,
    SortableList,
    MediaPicker,
    EditorPreview,
    DateTimePicker,
    RichTextEditor
  } from '$lib/components/ui';
  import { ActEditDialog, SlugDialog } from '$lib/components/dialogs';
  import { slugify } from '$lib/utils/slug';
  import ShowPage from '$lib/pages/ShowPage.svelte';
  import { SectionCard } from '$lib/components/cards';
  import VenueAutocomplete from '$lib/components/inputs/VenueAutocomplete.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { tick } from 'svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData, type UnifiedDraftData } from '../../publishDraft';
  import { deleteShow, setShowPage } from '../../data.remote';
  import { updatePage } from '../../pages/data.remote';
  import type { Venue } from '$lib/server/schema';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * Edits go into the shared draft, so this page behaves like every other
   * editor in here: the sidebar shows unsaved changes, Undo reverts them, and
   * Update commits them. Nothing on this page saves on its own.
   */
  const draftData = draft.getData<UnifiedDraftData>();
  const show = $derived(draftData.shows?.find((s) => s.id === data.showId));

  /*
   * Rows are acts, held locally so a row being dragged has an identity while
   * its act is still being chosen. Written back to the show as ids in order,
   * which is what the join stores.
   */
  let nextRowId = 0;
  let rows = $state<{ id: number; actId: number | null; setTime: string | null }[]>([]);
  let loadedFor = $state<number | null>(null);

  $effect(() => {
    if (!show || loadedFor === show.id) return;
    loadedFor = show.id;
    nextRowId = 0;
    rows = (show.lineup ?? []).map((entry) => ({
      id: nextRowId++,
      actId: entry.actId,
      setTime: entry.setTime
    }));
  });

  const actsById = $derived(new Map((data.acts ?? []).map((b) => [b.id, b])));

  function syncLineup() {
    if (!show) return;
    show.lineup = rows
      .filter((r) => r.actId != null)
      .map((r) => ({ actId: r.actId as number, setTime: r.setTime }));
  }

  function addRow() {
    const row = { id: nextRowId++, actId: null, setTime: null };
    rows = [...rows, row];
    editingRow = row.id;
  }

  function removeRow(id: number) {
    rows = rows.filter((r) => r.id !== id);
    syncLineup();
  }

  /*
   * Picking an act and editing one are the same trip in practice, so both
   * happen in a dialog rather than as controls crowded into the row. The row
   * shows what's there; the dialog is where it's decided.
   */
  let editingRow = $state<number | null>(null);

  const editingAct = $derived.by(() => {
    if (editingRow === null) return null;
    const row = rows.find((r) => r.id === editingRow);
    if (!row) return null;
    return row.actId != null ? (actsById.get(row.actId) ?? 'new') : 'new';
  });

  function handleActSaved(actId: number, setTime: string | null) {
    const row = rows.find((r) => r.id === editingRow);
    if (row) {
      row.actId = actId;
      row.setTime = setTime;
    }
    syncLineup();
    editingRow = null;
  }

  const editingSetTime = $derived(rows.find((r) => r.id === editingRow)?.setTime ?? null);

  /*
   * One switch: the show is at an address or it isn't. Switching it off
   * unpublishes rather than deleting, so the slug survives and a link already
   * in circulation still works if it comes back.
   *
   * Immediate, not staged — it creates a row that owns a public URL, and the
   * address it hands out shouldn't be pending.
   */
  const showPage = $derived(data.pages?.find((pg) => pg.id === show?.pageId) ?? null);
  let togglingPage = $state(false);

  async function togglePage() {
    if (!show || togglingPage) return;

    togglingPage = true;
    try {
      await setShowPage({ showId: show.id, enabled: !(showPage?.published ?? false) });
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the landing page');
    } finally {
      togglingPage = false;
    }
  }

  /*
   * The preview needs names and logos; the draft holds ids. Resolved here so
   * the pane follows an unsaved reorder or a swapped act rather than showing
   * what's on disk.
   */
  /*
   * The frame the poster was cropped in, from the library the layout already
   * loads. Resolved here so the preview follows an unsaved change rather than
   * whatever was published.
   */
  const posterShape = $derived(
    show?.imageUrl
      ? ((data.media ?? []).find((m) => m.url === show.imageUrl)?.cropShape ?? null)
      : null
  );

  const previewLineup = $derived(
    rows
      .map((row) => ({ act: row.actId != null ? actsById.get(row.actId) : undefined, row }))
      .filter((x) => x.act != null)
      .map(({ act, row }) => ({
        name: act!.name,
        logoUrl: act!.logoUrl,
        isSelf: act!.isSelf,
        setTime: row.setTime
      }))
  );

  /*
   * The address hangs off the title field rather than taking a row of its own,
   * the same as a release's. It's set once and rarely touched — and it's the
   * one field you must not change casually, because a link already shared stops
   * working.
   */
  let slugOpen = $state(false);

  /*
   * The addresses that would be reasonable for this show: the title, if it has
   * one, and the venue-and-date default it was generated from. A `-2` suffix
   * still counts as a match.
   *
   * Both, because either is a fair choice — warning that a slug matching the
   * title "no longer matches the venue and date" is telling someone off for
   * naming it after the thing it's called.
   */
  const slugCandidates = $derived(
    show
      ? [slugify(show.title ?? ''), slugify(`${show.venue.name} ${show.date}`)].filter(Boolean)
      : []
  );

  const slugMatchesShow = $derived(
    !showPage ||
      slugCandidates.some((base) => showPage.slug === base || showPage.slug.startsWith(`${base}-`))
  );

  async function saveSlug(next: string) {
    if (!showPage) return;
    try {
      await updatePage({ id: showPage.id, slug: next });
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the address');
    }
  }

  function handleVenueChange(venue: Venue) {
    if (show) show.venue = venue;
  }

  /*
   * Immediate, like every other delete in the admin: it removes a row the
   * draft is holding, so the draft has to be re-seeded afterwards or it would
   * keep offering to publish a show that no longer exists.
   */
  async function remove() {
    if (!show) return;
    if (!confirm(`Delete the show at ${show.venue.name}?`)) return;

    await deleteShow(show.id);
    await invalidateAll();
    await tick();
    draft.initialize(buildDraftFromServerData(data));
    toast.info('Show deleted');
    await goto('/admin/shows');
  }
</script>

<!--
  The column is ordered the way the job is done: when and where, the poster
  you'd have been sent, who's playing, then how to get in. Delete is last, so
  it can't be hit on the way to anything else.
-->
{#snippet editorColumn()}
  {#if show}
    <div class="space-y-4">
      <SectionCard title="When and where">
        {#snippet actions()}
          <div class="flex items-center gap-2">
            <!-- The word says the state, because the switch's job is whether
                 the gig is at an address at all — off means nobody can reach
                 it, signed in or not. -->
            <span class="text-sm {showPage?.published ? 'text-gray-400' : 'text-gray-500'}">
              {showPage?.published ? 'Landing page visible' : 'Landing page not visible'}
            </span>
            <ToggleSwitch
              checked={showPage?.published ?? false}
              label="Show this gig at its own address"
              onchange={togglePage}
              size="md"
              hideLabel
            />
          </div>
        {/snippet}

        <div class="space-y-4">
          <div>
            <label for="show-title" class={labelClass}>Title</label>
            <div class="relative">
              <input
                id="show-title"
                type="text"
                value={show.title ?? ''}
                oninput={(e) => (show.title = e.currentTarget.value || null)}
                placeholder="e.g. Kortreist Musikkfestival"
                class="{fieldClass} {showPage ? 'pr-10' : ''}"
              />
              <!-- Only once the show has a page: without one there's no address
                   to edit. Amber only when the address matches neither the
                   title nor the venue and date — worth noticing, not worth
                   fixing for you, since a shared link would stop working. -->
              {#if showPage}
                <button
                  type="button"
                  onclick={() => (slugOpen = true)}
                  class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition hover:bg-gray-700 {slugMatchesShow
                    ? 'text-gray-500 hover:text-gray-300'
                    : 'text-amber-400'}"
                  title={slugMatchesShow
                    ? `Address: /${showPage.slug}`
                    : `Address is /${showPage.slug}, which matches neither the title nor the venue and date`}
                  aria-label="Edit page address"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"
                    />
                  </svg>
                </button>
              {/if}
            </div>
            <p class="mt-2 text-sm text-gray-500">
              The event's own name, when it has one that isn't the venue.
            </p>
          </div>

          <!--
            Not native date/time inputs: Chromium renders those in the browser's
            locale, so a Norwegian site on an English browser shows 09/18/2026
            and 7:30 PM whatever the setting says. These go through Intl.

            No show-level stage time: each act carries its own on the line-up,
            and the first of those is when the show starts.
          -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <span class={labelClass}>Date</span>
              <DateTimePicker
                mode="date"
                compact
                value={show.date}
                locale={data.settings?.locale || 'nb-NO'}
                onchange={(v) => (show.date = v)}
              />
            </div>
            <div>
              <span class={labelClass}>Doors</span>
              <DateTimePicker
                mode="time"
                compact
                value={show.doorsTime ?? ''}
                locale={data.settings?.locale || 'nb-NO'}
                onchange={(v) => (show.doorsTime = v || null)}
              />
            </div>
          </div>

          <VenueAutocomplete
            venue={show.venue}
            apiKey={data.googleConfig?.placesEnabled ? data.googleConfig.apiKey : null}
            onchange={handleVenueChange}
          />

          <div>
            <span class={labelClass}>About</span>
            <!--
              Optional, and most gigs won't want it: a date, a venue and a
              line-up already say what the night is. This is for the ones with
              something more to say, and it only shows on the show's own page.
            -->
            <RichTextEditor
              content={show.description ?? ''}
              onUpdate={(html: string) => (show.description = html || null)}
              placeholder="A launch, a last night, who's opening — anything the poster doesn't say."
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Poster">
        <MediaPicker
          value={show.imageUrl}
          label="Poster"
          media={data.media}
          aspectRatio="4/5"
          kind="image"
          onselect={(url: string | null) => (show.imageUrl = url)}
        />
      </SectionCard>

      <SectionCard title="Line-up">
        <p class="mb-3 text-sm text-gray-500">
          One act per row, in running order — first on stage at the top.
        </p>

        {#if rows.length > 0}
          <SortableList gap="0.375rem" bind:items={rows} onreorder={syncLineup}>
            {#snippet children(row: { id: number; actId: number | null; setTime: string | null })}
              {@const act = row.actId != null ? actsById.get(row.actId) : undefined}
              <div
                class="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div data-drag-handle class="cursor-grab text-gray-600 hover:text-gray-400">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 8h16M4 16h16"
                    />
                  </svg>
                </div>

                <button
                  type="button"
                  onclick={() => (editingRow = row.id)}
                  class="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-800 bg-gray-900"
                  >
                    {#if act?.logoUrl}
                      <img src={act.logoUrl} alt="" class="h-full w-full object-contain" />
                    {/if}
                  </span>

                  <span class="min-w-0 flex-1 truncate text-sm text-white">
                    {act?.name ?? 'Choose an act…'}
                  </span>

                  {#if row.setTime}
                    <span class="shrink-0 text-xs text-gray-500">{row.setTime}</span>
                  {/if}
                </button>

                <button
                  type="button"
                  onclick={() => removeRow(row.id)}
                  class="shrink-0 text-gray-600 transition-colors hover:text-red-400"
                  aria-label="Remove from this show"
                  title="Remove from this show"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            {/snippet}
          </SortableList>
        {/if}

        <button
          type="button"
          onclick={addRow}
          class="mt-3 text-sm text-gray-400 transition-colors hover:text-white"
        >
          + Add act
        </button>
      </SectionCard>

      <SectionCard title="Tickets">
        <div class="space-y-4">
          <div>
            <label for="show-ticket-url" class={labelClass}>Ticket URL</label>
            <input
              id="show-ticket-url"
              type="url"
              value={show.ticketUrl ?? ''}
              oninput={(e) => (show.ticketUrl = e.currentTarget.value || null)}
              placeholder="https://"
              class={fieldClass}
            />
          </div>

          <div>
            <label for="show-event-url" class={labelClass}>Event URL</label>
            <input
              id="show-event-url"
              type="url"
              value={show.eventUrl ?? ''}
              oninput={(e) => (show.eventUrl = e.currentTarget.value || null)}
              placeholder="https://"
              class={fieldClass}
            />
            <p class="mt-2 text-sm text-gray-500">
              Facebook, Bandsintown — wherever the event lives.
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm text-white">Sold out</span>
              <p class="text-xs text-gray-500">Shown on the listing instead of a ticket link</p>
            </div>
            <ToggleSwitch
              checked={show.soldOut ?? false}
              label="Sold out"
              onchange={() => (show.soldOut = !show.soldOut)}
              size="md"
              hideLabel
            />
          </div>
        </div>
      </SectionCard>

      <!-- Last thing in the column, so it can't be hit on the way to anything
         else. Full width to read as the end of the page rather than an action
         competing with the ones in the cards above. -->
      <button
        type="button"
        onclick={remove}
        class="mt-6 w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete show
      </button>
    </div>
  {/if}
{/snippet}

{#if !show}
  <div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
    <p class="text-sm text-gray-500">This show is no longer in the draft.</p>
  </div>
{:else}
  <!--
    The preview is there whether or not the page is public: it's the only way to
    see what you're building, and a gig with its landing page off is still a gig
    you're describing. Only the open-in-a-tab link depends on it being live —
    there's no address to open otherwise.
  -->
  <EditorPreview previewStyle="background-color: {data.settings?.colorBg ?? '#0c0a14'}">
    {#snippet editor()}
      {@render editorColumn()}
    {/snippet}

    {#snippet preview()}
      <!-- Wrapped so the link has something to position against: the preview
           pane itself is a plain scroll container. -->
      <div class="relative">
        {#if showPage?.published}
          <!-- Over the preview rather than in the editor column — it opens the
               very thing being previewed, so it belongs to that pane. -->
          <a
            href="/{showPage.slug}"
            target="_blank"
            rel="noopener"
            title="Open /{showPage.slug} in a new tab"
            aria-label="Open the live page in a new tab"
            class="absolute top-3 right-3 z-10 rounded-lg border border-white/15 bg-black/50 p-2 text-white/70 backdrop-blur-sm transition hover:border-white/30 hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        {/if}

        <ShowPage
          {show}
          lineup={previewLineup}
          imageShape={posterShape}
          settings={data.settings}
          profile={data.profile}
          media={data.media}
          locale={data.settings?.locale ?? 'nb-NO'}
        />
      </div>
    {/snippet}
  </EditorPreview>
{/if}

<!-- Mounted only while open, so it initialises on mount rather than needing an
     effect to copy the selected act into local state. -->
{#if slugOpen && showPage}
  <SlugDialog
    slug={showPage.slug}
    title={show?.title || show?.venue.name || ''}
    onsave={saveSlug}
    onclose={() => (slugOpen = false)}
  />
{/if}

{#if editingAct}
  <ActEditDialog
    act={editingAct}
    acts={data.acts ?? []}
    media={data.media}
    setTime={editingSetTime}
    locale={data.settings?.locale || 'nb-NO'}
    onsaved={handleActSaved}
    onclose={() => (editingRow = null)}
  />
{/if}
