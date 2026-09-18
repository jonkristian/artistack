<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import {
    ToggleSwitch,
    SortableList,
    MediaPicker,
    EditorPreview,
    DateTimePicker,
    LengthMeter,
    RichTextEditor
  } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import { SlugDialog, LinkEditDialog } from '$lib/components/dialogs';
  import type { LinkValues } from '$lib/components/dialogs/LinkEditDialog.svelte';
  import LinkRow from '$lib/components/admin/LinkRow.svelte';
  import { slugify } from '$lib/utils/slug';
  import ReleasePage from '$lib/pages/ReleasePage.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import {
    platformLabel,
    platformsInCategory,
    contrastSafeColor,
    detectPlatformFromUrl
  } from '$lib/utils/platforms';
  import { tick } from 'svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import {
    buildDraftFromServerData,
    fromDateInput,
    type UnifiedDraftData
  } from '../../publishDraft';
  import { deleteRelease, announceReleaseNow, findStoreLinksNow } from '../data.remote';
  import type { Link } from '$lib/server/schema';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * Straight off the server rather than held here: the send writes the date
   * before it mails anybody, so reloading the row is both the truth and the
   * simplest way to have it survive opening another release.
   */
  const announced = $derived(data.release.announcedAt ?? null);
  let announcing = $state(false);

  async function announce() {
    if (announcing) return;
    const count = data.subscriberCount;
    if (
      !confirm(
        count === 1
          ? 'Send this to the one person on the fan list?'
          : `Send this to all ${count} people on the fan list? It can only be done once.`
      )
    )
      return;

    announcing = true;
    try {
      const result = await announceReleaseNow({ id: data.release.id });
      if (result.held) {
        toast.error(result.held);
      } else {
        await invalidateAll();
        toast.info(
          result.failed
            ? `Sent to ${result.sent}, ${result.failed} bounced back`
            : `Sent to ${result.sent}`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send that');
    }
    announcing = false;
  }

  /*
   * Edits go into the shared draft, so this page behaves like every other
   * editor in here: the sidebar shows unsaved changes, Undo reverts them, and
   * Update commits them. Nothing on this page saves on its own.
   */
  const draftData = draft.getData<UnifiedDraftData>();
  const release = $derived(draftData.releases?.find((r) => r.id === data.release.id));

  // In the order they show on the release page, which is the order they're
  // dragged into here.
  const releaseLinks = $derived(
    (draftData.links ?? [])
      .filter((l: Link) => l.releaseId === data.release.id)
      .sort((a: Link, b: Link) => (a.position ?? 0) - (b.position ?? 0))
  );

  /*
   * The address hangs off the title field rather than taking a row of its own.
   * It's set once and then rarely touched — it is the one field you must not
   * change casually — so a permanent row restating it was the least earned row
   * on the page.
   */
  let slugOpen = $state(false);
  const slugMatchesTitle = $derived(release ? release.slug === slugify(release.title) : true);

  const previewDate = $derived(
    (release && fromDateInput(release.releaseDate)) ?? data.release.releaseDate
  );
  /** The bar track's colour (Tailwind gray-800), for the contrast check. */
  const ADMIN_TRACK = '#1e2939';

  const isOut = $derived(previewDate.getTime() <= Date.now());

  async function removeRelease() {
    if (!release) return;
    if (!confirm(`Delete “${release.title}” and its page? This can't be undone.`)) return;
    try {
      await deleteRelease({ id: data.release.id });
      toast.info('Release deleted');
      await goto('/admin/releases');
      await invalidateAll();
      await tick();
      // Drop it from the draft too, or Update would try to write a row that
      // no longer exists.
      draft.initialize(buildDraftFromServerData(data));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
    }
  }

  // --- links -------------------------------------------------------------

  // Streaming only. This list was every platform the app knows, which offered
  // GitHub and See Tickets as places to hear a single.
  const platformOptions = platformsInCategory('streaming');

  let newPlatform = $state('spotify');
  let newUrl = $state('');

  function addLink(event: SubmitEvent) {
    event.preventDefault();
    if (!newUrl) return;

    // A negative id marks it unsaved; publish swaps it for the real one, the
    // same way an unsaved block's links are created.
    draftData.links.push({
      id: draft.getTempId(),
      blockId: null,
      releaseId: data.release.id,
      category: 'streaming',
      platform: newPlatform,
      url: newUrl,
      label: platformLabel(newPlatform),
      thumbnailUrl: null,
      embedData: null,
      // After the last one rather than at the count: a removed link leaves a
      // gap, and the count would then tie with whatever sits at the end.
      position: Math.max(-1, ...releaseLinks.map((l: Link) => l.position ?? 0)) + 1,
      visible: true
    });

    newUrl = '';
  }

  function reorderLinks(items: Link[]) {
    items.forEach((item, i) => {
      const link = draftData.links.find((l: Link) => l.id === item.id);
      if (link) link.position = i;
    });
  }

  function removeLink(id: number) {
    const index = draftData.links.findIndex((l: Link) => l.id === id);
    if (index !== -1) draftData.links.splice(index, 1);
  }
  // Pasting a link picks its service, the way a links block does. The select
  // stays for the ones we can't tell from the address.
  function detectPlatform() {
    const detected = detectPlatformFromUrl(newUrl);
    if (detected?.category === 'streaming') newPlatform = detected.platform;
  }

  // The same dialog a links block edits with, so a link edits alike everywhere.
  let editingLink = $state<Link | null>(null);

  function saveLink(values: LinkValues) {
    const target = draftData.links.find((l: Link) => l.id === editingLink?.id);
    if (target) Object.assign(target, values);
    editingLink = null;
  }

  function deleteLink(id: number) {
    removeLink(id);
    editingLink = null;
  }

  let finding = $state(false);

  /*
   * Writes rows on the server, so the draft has to be rebuilt from what came
   * back — the same dance as deleting. Anything typed and not yet saved would
   * be overwritten by that, so it asks first rather than quietly discarding it.
   */
  async function findLinks() {
    if (finding) return;
    if (
      draft.isDirty() &&
      !confirm('This reloads the release, which will discard your unsaved changes. Continue?')
    )
      return;

    finding = true;
    try {
      const { filled } = await findStoreLinksNow({ id: data.release.id });
      if (filled > 0) {
        await invalidateAll();
        await tick();
        draft.initialize(buildDraftFromServerData(data));
        toast.info(filled === 1 ? 'Found one service' : `Found ${filled} services`);
      } else {
        toast.info('Nothing found yet — the stores publish on release day.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reach the stores');
    }
    finding = false;
  }
</script>

{#if release}
  <EditorPreview previewStyle="background-color: {data.settings?.colorBg ?? '#0c0a14'}">
    {#snippet editor()}
      <SectionCard title="Details">
        {#snippet actions()}
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">{release.published ? 'Live' : 'Draft'}</span>
            <ToggleSwitch
              checked={release.published}
              label="Publish release page"
              onchange={() => (release.published = !release.published)}
              size="md"
              hideLabel
            />
          </div>
        {/snippet}

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class={labelClass} for="title">Title</label>
            <div class="relative">
              <input id="title" class="{fieldClass} pr-10" bind:value={release.title} />
              <!-- Amber once the address stops matching the title: worth
                   noticing, not worth fixing on your behalf. -->
              <button
                type="button"
                onclick={() => (slugOpen = true)}
                class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition hover:bg-gray-700 {slugMatchesTitle
                  ? 'text-gray-500 hover:text-gray-300'
                  : 'text-amber-400'}"
                title={slugMatchesTitle
                  ? `Address: /${release.slug}`
                  : `Address is /${release.slug}, which no longer matches the title`}
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
            </div>
          </div>
          <div>
            <label class={labelClass} for="date">Release date</label>
            <DateTimePicker
              mode="date"
              compact
              value={release.releaseDate}
              locale={data.settings?.locale || 'nb-NO'}
              onchange={(v) => (release.releaseDate = v)}
            />
          </div>
        </div>

        <div class="mt-4">
          <MediaPicker
            value={release.coverUrl}
            label="Cover art"
            media={data.media}
            aspectRatio="1/1"
            kind="image"
            onselect={(url) => (release.coverUrl = url)}
          />
        </div>

        <div class="mt-4">
          <!-- Plain text, and it stays plain: this ends up inside a meta tag,
               where a <p> would be printed rather than obeyed. No emoji either
               — search engines strip them out of a description and a link
               preview is not where a record wants to look like an advert. They
               belong in the copy below, and in a post caption. -->
          <label class={labelClass} for="description">Description</label>
          <textarea id="description" class={fieldClass} rows="2" bind:value={release.description}
          ></textarea>
          <LengthMeter
            value={release.description}
            limit={160}
            hard={200}
            hint="Used as the page description and the text in link previews."
            softHint="Search results will cut this off. Link previews still show it all."
            hardHint="Past this, search results and link previews both cut it short."
          />
        </div>

        <div class="mt-4">
          <span class={labelClass}>About this release</span>
          <!-- The words on the page, as against the ones a scraper reads. No
               length to keep to: this is under the buttons, where someone who
               has already found what they came for can read as much as they
               like. -->
          <RichTextEditor
            content={release.body ?? ''}
            onUpdate={(html: string) => (release.body = html || null)}
            placeholder="What the record is, who played on it, who it's for…"
          />
          <p class="mt-1 text-xs text-gray-500">Shown on the release page, below the services.</p>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label class={labelClass} for="share">Share image</label>
            <input
              id="share"
              class={fieldClass}
              bind:value={release.shareImageUrl}
              placeholder="/share/i-will-be-me.jpg"
            />
            <p class="mt-1 text-xs text-gray-500">
              Optional — the cover is used when this is empty. Chat apps cache whatever they see
              first, so keep the path stable once a link is out.
            </p>
          </div>
          <div>
            <label class={labelClass} for="presave">Pre-save link</label>
            <input
              id="presave"
              class={fieldClass}
              bind:value={release.presaveUrl}
              placeholder="https://ffm.to/…"
            />
            <p class="mt-1 text-xs text-gray-500">
              Shown as a button until the release date passes.
            </p>
          </div>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label class={labelClass} for="isrc">ISRC</label>
            <input
              id="isrc"
              class={fieldClass}
              bind:value={release.isrc}
              placeholder="NOxxx2600001"
            />
          </div>
          <div>
            <label class={labelClass} for="upc">UPC</label>
            <input id="upc" class={fieldClass} bind:value={release.upc} />
          </div>
        </div>
      </SectionCard>

      <!-- Gap on the stack rather than a margin on each card: the fan list is
           conditional, and a margin on it leaves nothing behind when it's off. -->
      <div class="mt-6 flex flex-col gap-6">
        <SectionCard title="Streaming links">
          {#snippet actions()}
            <button
              type="button"
              class="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:border-gray-600 hover:text-white disabled:opacity-50"
              onclick={findLinks}
              disabled={finding || (!release?.isrc && !release?.upc)}
              title={!release?.isrc && !release?.upc
                ? 'Needs an ISRC or a UPC to look up'
                : 'Ask the stores where this record is'}
            >
              {finding ? 'Looking…' : 'Find links'}
            </button>
          {/snippet}
          <p class="-mt-2 mb-3 text-xs text-gray-500">
            These fill themselves in from the ISRC once the record is out — the site checks hourly
            on release day, and the fan list email waits for them. Add one by hand any time; nothing
            here is overwritten. Each is served through <span class="font-mono">/go</span>, so
            clicks are counted per platform and campaign tags carry through to the destination.
          </p>

          <form class="flex gap-2" onsubmit={addLink}>
            <select
              aria-label="Platform"
              class="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:border-gray-600 focus:outline-none"
              bind:value={newPlatform}
            >
              {#each platformOptions as platform (platform)}
                <option value={platform}>{platformLabel(platform)}</option>
              {/each}
            </select>
            <input
              type="url"
              aria-label="Link URL"
              class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              bind:value={newUrl}
              oninput={detectPlatform}
              placeholder="Paste URL..."
            />
            <button
              type="submit"
              class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              disabled={!newUrl.trim()}
            >
              Add
            </button>
          </form>

          {#if releaseLinks.length > 0}
            <div class="mt-3">
              <SortableList items={releaseLinks} onreorder={reorderLinks}>
                {#snippet children(link: Link)}
                  <LinkRow {link} onedit={(l) => (editingLink = l)} ondelete={removeLink} />
                {/snippet}
              </SortableList>
            </div>
          {/if}
        </SectionCard>

        <!--
          Only where the fan list is switched on. A site that collects no
          addresses has nobody to tell.
        -->
        {#if data.settings?.subscribersEnabled}
          <SectionCard title="The fan list">
            <p class="-mt-2 mb-3 text-xs text-gray-500">
              {#if announced}
                Told on {new Intl.DateTimeFormat(data.settings?.locale || 'nb-NO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                }).format(announced)}. Once only — a second announcement of the same record is how a
                list stops being read.
              {:else}
                One email each, with the sleeve, your words and the services. It sends itself at 9am
                on the first morning after the release date; this is for when you'd rather it went
                now — once the store links actually resolve.
              {/if}
            </p>

            {#if !announced}
              <button
                type="button"
                class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                disabled={announcing}
                onclick={announce}
              >
                {announcing ? 'Sending…' : 'Tell the fan list'}
              </button>
            {/if}
          </SectionCard>
        {/if}
      </div>

      {#if data.clicks.total > 0}
        <div class="mt-6">
          <SectionCard title="Last 30 days">
            <p class="mb-4 text-2xl font-semibold text-white tabular-nums">
              {data.clicks.total}
              <span class="text-sm font-normal text-gray-500">
                {data.clicks.total === 1 ? 'click' : 'clicks'}
              </span>
            </p>

            <!-- Bars rather than numbers alone: which platform leads is the
                 question, and a share of the widest bar answers it faster than
                 comparing four figures. -->
            <div class="flex flex-col gap-2">
              {#each data.clicks.byPlatform as row (row.platform)}
                {@const share = Math.round((row.count / data.clicks.total) * 100)}
                <div class="flex items-center gap-3">
                  <span class="w-32 shrink-0 truncate text-sm text-gray-300">
                    {row.label ?? platformLabel(row.platform)}
                  </span>
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                    <!-- Measured against the track it sits on, not the card:
                         TIDAL and TikTok are black-branded and vanish there. -->
                    <div
                      class="h-full rounded-full"
                      style="width: {share}%; background-color: {contrastSafeColor(
                        row.platform,
                        ADMIN_TRACK,
                        '#8b5cf6'
                      )}"
                    ></div>
                  </div>
                  <span class="w-14 shrink-0 text-right text-sm text-gray-400 tabular-nums">
                    {row.count}
                  </span>
                </div>
              {/each}
            </div>

            <div class="mt-5 grid gap-5 border-t border-gray-800 pt-4 sm:grid-cols-2">
              <div>
                <h3 class="mb-2 text-xs tracking-wider text-gray-500 uppercase">Device</h3>
                <dl class="flex flex-col gap-1">
                  {#each data.clicks.byDevice as row (row.device)}
                    <div class="flex justify-between text-sm">
                      <dt class="text-gray-400 capitalize">{row.device}</dt>
                      <dd class="text-gray-300 tabular-nums">{row.count}</dd>
                    </div>
                  {/each}
                </dl>
              </div>
              <div>
                <h3 class="mb-2 text-xs tracking-wider text-gray-500 uppercase">Country</h3>
                <dl class="flex flex-col gap-1">
                  {#each data.clicks.byCountry as row (row.country)}
                    <div class="flex justify-between text-sm">
                      <dt class="text-gray-400 uppercase">{row.country}</dt>
                      <dd class="text-gray-300 tabular-nums">{row.count}</dd>
                    </div>
                  {/each}
                </dl>
              </div>
            </div>
          </SectionCard>
        </div>
      {/if}

      <!-- Last thing in the column, so it can't be hit on the way to anything
           else. Full width to read as the end of the page rather than an
           action competing with the ones in the cards above. -->
      <button
        type="button"
        onclick={removeRelease}
        class="mt-6 w-full rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        Delete release
      </button>
    {/snippet}

    {#snippet preview()}
      <!-- Wrapped so the link has something to position against: the preview
           pane itself is a plain scroll container. -->
      <div class="relative">
        <!-- Over the preview rather than in the editor column — it opens the
             very thing being previewed, so it belongs to that pane. -->
        <a
          href="/{data.page.slug}"
          target="_blank"
          rel="noopener"
          title="Open /{data.page.slug} in a new tab"
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

        <ReleasePage
          release={{
            ...data.release,
            title: release.title,
            presaveUrl: release.presaveUrl,
            body: release.body
          }}
          {releaseLinks}
          cover={release.coverUrl}
          {isOut}
          published={release.published}
          settings={data.settings}
          profile={data.profile}
          artist={data.profile?.name ?? ''}
          emailCapture={data.settings?.subscribersEnabled ?? false}
          source={release.slug}
          preview
        />
      </div>
    {/snippet}
  </EditorPreview>

  <!-- Mounted only while open, like the other dialogs: it reads its starting
       value once, so a fresh mount is what gives it a fresh value. -->
  {#if slugOpen}
    <SlugDialog
      slug={release.slug}
      title={release.title}
      onsave={(next) => (release.slug = next)}
      onclose={() => (slugOpen = false)}
    />
  {/if}

  {#if editingLink}
    <LinkEditDialog
      link={editingLink}
      themeColors={{
        bg: data.settings?.colorBg ?? '#0c0a14',
        card: data.settings?.colorCard ?? '#1a1625',
        accent: data.settings?.colorAccent ?? '#8b5cf6'
      }}
      onsave={saveLink}
      ondelete={deleteLink}
      onclose={() => (editingLink = null)}
    />
  {/if}
{/if}
