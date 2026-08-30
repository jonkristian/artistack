<script lang="ts">
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { ToggleSwitch, MediaPicker, EditorPreview } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import { SlugDialog } from '$lib/components/dialogs';
  import { slugify } from '$lib/utils/slug';
  import ReleasePage from '$lib/pages/ReleasePage.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { platformLabel, platformsInCategory, contrastSafeColor } from '$lib/utils/platforms';
  import { tick } from 'svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import {
    buildDraftFromServerData,
    fromDateInput,
    type UnifiedDraftData
  } from '../../publishDraft';
  import { deleteRelease } from '../data.remote';
  import type { Link } from '$lib/server/schema';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * Edits go into the shared draft, so this page behaves like every other
   * editor in here: the sidebar shows unsaved changes, Undo reverts them, and
   * Update commits them. Nothing on this page saves on its own.
   */
  const draftData = draft.getData<UnifiedDraftData>();
  const release = $derived(draftData.releases?.find((r) => r.id === data.release.id));

  const releaseLinks = $derived(
    (draftData.links ?? []).filter((l: Link) => l.releaseId === data.release.id)
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
      position: releaseLinks.length,
      visible: true
    });

    newUrl = '';
  }

  function removeLink(id: number) {
    const index = draftData.links.findIndex((l: Link) => l.id === id);
    if (index !== -1) draftData.links.splice(index, 1);
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
            <input id="date" type="date" class={fieldClass} bind:value={release.releaseDate} />
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
          <label class={labelClass} for="description">Description</label>
          <textarea id="description" class={fieldClass} rows="2" bind:value={release.description}
          ></textarea>
          <p class="mt-1 text-xs text-gray-500">
            Used as the page description and the text in link previews.
          </p>
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

      <div class="mt-6">
        <SectionCard title="Streaming links">
          <p class="-mt-2 mb-3 text-xs text-gray-500">
            Each one is served through <span class="font-mono">/go</span>, so clicks are counted per
            platform and campaign tags carry through to the destination.
          </p>

          {#if releaseLinks.length > 0}
            <ul class="flex flex-col gap-2">
              {#each releaseLinks as link (link.id)}
                <li
                  class="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 p-3"
                >
                  <span class="w-28 shrink-0 truncate text-sm text-gray-300">
                    {link.label ?? platformLabel(link.platform)}
                  </span>
                  <input class="{fieldClass} flex-1" bind:value={link.url} />
                  <button
                    type="button"
                    class="shrink-0 px-2 text-sm text-gray-500 transition hover:text-red-400"
                    onclick={() => removeLink(link.id)}
                    aria-label="Remove {link.platform} link"
                  >
                    Remove
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <form class="mt-4 flex flex-wrap items-end gap-3" onsubmit={addLink}>
            <div>
              <label class={labelClass} for="platform">Platform</label>
              <select id="platform" class={fieldClass} bind:value={newPlatform}>
                {#each platformOptions as platform (platform)}
                  <option value={platform}>{platformLabel(platform)}</option>
                {/each}
              </select>
            </div>
            <div class="min-w-52 flex-1">
              <label class={labelClass} for="url">Link</label>
              <input id="url" class={fieldClass} bind:value={newUrl} placeholder="https://…" />
            </div>
            <button
              type="submit"
              class="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 transition hover:border-gray-600 hover:text-white disabled:opacity-50"
              disabled={!newUrl}
            >
              Add
            </button>
          </form>
        </SectionCard>
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
          release={{ ...data.release, title: release.title, presaveUrl: release.presaveUrl }}
          {releaseLinks}
          cover={release.coverUrl}
          {isOut}
          published={release.published}
          settings={data.settings}
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
{/if}
