<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import SetupCard from '$lib/components/admin/SetupCard.svelte';
  import ViewsChart from '$lib/components/admin/ViewsChart.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData } from './publishDraft';
  import { CLIP_STATUS_LABELS, CLIP_STATUS_DOTS, type ClipStatus } from '$lib/clips/types';
  import { createProject } from './clips/data.remote';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /*
   * First-run setup lives here rather than on a page editor. It's about the
   * site existing at all, which is the dashboard's subject; the editor's is
   * one page's blocks.
   */
  let needsSetup = $state(untrack(() => !data.settings?.setupCompleted));

  async function handleSetupComplete() {
    await invalidateAll();
    await tick();
    // Re-initialize draft with new data (which now includes default blocks)
    draft.initialize(buildDraftFromServerData(data));
    needsSetup = false;
    toast.info('Setup complete! Start customizing your page.');
  }

  const formatDate = $derived(
    new Intl.DateTimeFormat(data.settings?.locale || 'nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  );

  /*
   * The next release, or the last one if nothing is scheduled. Both are worth
   * saying — one is a deadline, the other is what people are currently landing
   * on — so which it is gets labelled rather than left to be inferred.
   */
  const nextRelease = $derived.by(() => {
    if (!data.settings?.releasesEnabled) return null;

    const all = [...(data.releases ?? [])].sort(
      (a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime()
    );
    const now = Date.now();
    const upcoming = all.find((r) => new Date(r.releaseDate).getTime() > now);
    if (upcoming) return { release: upcoming, upcoming: true };

    const last = all[all.length - 1];
    return last ? { release: last, upcoming: false } : null;
  });

  const daysUntil = $derived.by(() => {
    if (!nextRelease?.upcoming) return null;
    const ms = new Date(nextRelease.release.releaseDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  });

  // Everything still ahead, so a run of singles reads as a schedule rather
  // than one date with the rest hidden behind it.
  const upcomingReleases = $derived.by(() => {
    if (!data.settings?.releasesEnabled) return [];
    const now = Date.now();
    return [...(data.releases ?? [])]
      .filter((r) => new Date(r.releaseDate).getTime() > now)
      .sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime())
      .slice(0, 4);
  });

  /*
   * The next show. Free — the layout already loads tour dates for the draft —
   * and on an act's site it's the other date that matters besides a release.
   */
  const nextShow = $derived.by(() => {
    const now = Date.now();
    return [...(data.shows ?? [])]
      .filter((t) => new Date(t.date).getTime() > now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  });

  /*
   * How many are waiting in total, so the list can say what it isn't showing.
   * The same statuses the query filtered on — counted here rather than passed
   * down, since the grouped counts are already loaded.
   */
  const waitingTotal = $derived(
    (data.clipCounts ?? [])
      .filter((c) =>
        (['draft', 'rendered', 'review', 'rejected'] as ClipStatus[]).includes(
          c.status as ClipStatus
        )
      )
      .reduce((sum, c) => sum + c.total, 0)
  );

  /*
   * Custom pages can outlive the switch that made them — turning Extra pages
   * off doesn't delete them — so this checks the flag as well as the count,
   * rather than offering a tile that leads to a section you can't open.
   */
  const draftPages = $derived(
    data.settings?.pagesEnabled
      ? (data.pages ?? []).filter((p) => p.type === 'custom' && !p.published).length
      : 0
  );

  const mediaById = $derived(new Map((data.media ?? []).map((m) => [m.id, m])));

  /*
   * Creating a clip is one call — the name is a placeholder either way, so
   * there's nothing to ask for first. A release needs a title and a date, so
   * that one opens the form on its own page rather than guessing.
   */
  let creatingClip = $state(false);

  async function newClip() {
    if (creatingClip) return;
    creatingClip = true;
    try {
      const result = await createProject({ name: 'Untitled clip' });
      await goto(`/admin/clips/${result.project.id}`);
    } catch {
      toast.error('Could not create the clip');
    } finally {
      creatingClip = false;
    }
  }

  const tile = 'rounded-xl border border-gray-800 bg-gray-900 p-5';
  const action =
    'rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:text-white disabled:opacity-50';
</script>

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  {#if needsSetup}
    <SetupCard settings={data.settings} oncomplete={handleSetupComplete} />
  {:else}
    <div class="space-y-4">
      <!--
        Making a thing, not finding one — going somewhere is the sidebar's job,
        and repeating it here just puts the same link on screen twice. Each is
        offered only where the section it lands in exists.
      -->
      <div class="flex flex-wrap gap-2">
        {#if data.settings?.releasesEnabled}
          <a href="/admin/releases?new=1" class={action}>New release</a>
        {/if}
        {#if data.settings?.clipsEnabled}
          <button onclick={newClip} disabled={creatingClip} class={action}>
            {creatingClip ? 'Creating…' : 'New clip'}
          </button>
        {/if}
        <a href="/admin/media?upload=1" class={action}>Upload media</a>
      </div>

      <!-- What the site is doing. The detail is a click away in Stats. -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a href="/admin/stats" class="{tile} transition-colors hover:border-gray-700">
          <div class="text-sm text-gray-400">Views today</div>
          <div class="mt-2 text-2xl font-bold text-white">{data.overview.todayViews}</div>
          <div class="mt-1 text-sm text-gray-500">{data.overview.weekViews} this week</div>
        </a>

        <a href="/admin/stats" class="{tile} transition-colors hover:border-gray-700">
          <div class="text-sm text-gray-400">Clicks this week</div>
          <div class="mt-2 text-2xl font-bold text-white">{data.overview.weekClicks}</div>
          <div class="mt-1 text-sm text-gray-500">{data.overview.monthClicks} this month</div>
        </a>

        {#if data.audience}
          <a href="/admin/subscribers" class="{tile} transition-colors hover:border-gray-700">
            <div class="text-sm text-gray-400">Fan list</div>
            <div class="mt-2 text-2xl font-bold text-white">{data.audience.active}</div>
            <div class="mt-1 text-sm text-gray-500">
              {data.audience.recent} in the last 30 days
            </div>
          </a>
        {/if}

        <a href="/admin/stats" class="{tile} transition-colors hover:border-gray-700">
          <div class="text-sm text-gray-400">Most clicked</div>
          <div class="mt-2 truncate text-xl font-bold text-white">
            {data.overview.topLink?.label ?? data.overview.topLink?.platform ?? 'No clicks yet'}
          </div>
          <div class="mt-1 text-sm text-gray-500">
            {data.overview.topLink ? `${data.overview.topLink.clicks} clicks` : 'Last 30 days'}
          </div>
        </a>
      </div>

      <div class={tile}>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm text-gray-400">Views, last 30 days</span>
          <a href="/admin/stats" class="text-xs text-gray-500 hover:text-gray-300">All stats</a>
        </div>
        <div class="mt-3">
          <ViewsChart
            viewsByDay={data.pageViews.viewsByDay}
            previousViewsByDay={data.previousPeriodViews}
          />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        {#if nextRelease}
          <div class={tile}>
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm text-gray-400">
                {nextRelease.upcoming ? 'Coming up' : 'Latest release'}
              </span>
              <a href="/admin/releases" class="text-xs text-gray-500 hover:text-gray-300">
                All releases
              </a>
            </div>

            {#if upcomingReleases.length > 0}
              <ul class="mt-3 space-y-2">
                {#each upcomingReleases as release (release.id)}
                  <li>
                    <a href="/admin/releases/{release.id}" class="flex items-center gap-3">
                      <span
                        class="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-800 bg-gray-950"
                      >
                        {#if release.coverUrl}
                          <img
                            src={release.coverUrl}
                            alt=""
                            class="h-full w-full object-cover"
                            loading="lazy"
                          />
                        {/if}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm text-white">{release.title}</span>
                        <span class="block truncate text-xs text-gray-500">
                          {formatDate.format(new Date(release.releaseDate))}
                          {#if !release.published}· draft{/if}
                        </span>
                      </span>
                    </a>
                  </li>
                {/each}
              </ul>
            {:else}
              <a
                href="/admin/releases/{nextRelease.release.id}"
                class="mt-3 flex items-center gap-3"
              >
                <span
                  class="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-800 bg-gray-950"
                >
                  {#if nextRelease.release.coverUrl}
                    <img
                      src={nextRelease.release.coverUrl}
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  {/if}
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-xl font-bold text-white">
                    {nextRelease.release.title}
                  </span>
                  <span class="mt-1 block text-sm text-gray-500">
                    {formatDate.format(new Date(nextRelease.release.releaseDate))}
                    {#if !nextRelease.release.published}· draft{/if}
                  </span>
                </span>
              </a>
            {/if}

            {#if daysUntil !== null}
              <div class="mt-3 border-t border-gray-800 pt-3 text-sm text-gray-500">
                {daysUntil === 0 ? 'Out today' : `Out in ${daysUntil} days`}
              </div>
            {/if}
          </div>
        {/if}

        {#if data.clipCounts.length > 0}
          <div class={tile}>
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm text-gray-400">Clips waiting</span>
              <a href="/admin/clips" class="text-xs text-gray-500 hover:text-gray-300">All clips</a>
            </div>

            {#if data.waitingClips.length > 0}
              <ul class="mt-3 space-y-2">
                {#each data.waitingClips as clip (clip.id)}
                  {@const output = clip.outputMediaId
                    ? mediaById.get(clip.outputMediaId)
                    : undefined}
                  <li>
                    <a href="/admin/clips/{clip.id}" class="flex items-center gap-3">
                      <!--
                        Portrait, because that's the shape a clip is. A draft
                        has no render yet, so the frame stays empty rather than
                        collapsing and shuffling the rows that do have one.
                      -->
                      <span
                        class="h-14 w-8 shrink-0 overflow-hidden rounded-md border border-gray-800 bg-gray-950"
                      >
                        {#if output?.thumbnailUrl}
                          <img
                            src={output.thumbnailUrl}
                            alt=""
                            class="h-full w-full object-cover"
                            loading="lazy"
                          />
                        {/if}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm text-white">{clip.name}</span>
                        <span class="mt-0.5 flex items-center gap-2">
                          <span
                            class="h-2 w-2 shrink-0 rounded-full {CLIP_STATUS_DOTS[
                              clip.status as ClipStatus
                            ]}"
                          ></span>
                          <span class="truncate text-xs text-gray-500">
                            {CLIP_STATUS_LABELS[clip.status as ClipStatus]}
                          </span>
                        </span>
                      </span>
                    </a>
                  </li>
                {/each}
              </ul>

              {#if waitingTotal > data.waitingClips.length}
                <div class="mt-3 border-t border-gray-800 pt-3 text-sm text-gray-500">
                  and {waitingTotal - data.waitingClips.length} more
                </div>
              {/if}
            {:else}
              <div class="mt-2 text-xl font-bold text-white">Nothing waiting</div>
              <div class="mt-1 text-sm text-gray-500">Every clip is published or queued</div>
            {/if}
          </div>
        {/if}

        {#if nextShow && data.settings?.showsEnabled}
          <a href="/admin/shows" class="{tile} block transition-colors hover:border-gray-700">
            <div class="text-sm text-gray-400">Next show</div>
            <div class="mt-2 truncate text-xl font-bold text-white">
              {nextShow.venue.name || nextShow.title || 'Show'}
            </div>
            <div class="mt-1 truncate text-sm text-gray-500">
              {formatDate.format(new Date(nextShow.date))}
              {#if nextShow.venue.city}· {nextShow.venue.city}{/if}
            </div>
          </a>
        {/if}

        {#if draftPages > 0}
          <a href="/admin/pages" class="{tile} block transition-colors hover:border-gray-700">
            <div class="text-sm text-gray-400">Pages</div>
            <div class="mt-2 text-xl font-bold text-white">
              {draftPages}
              {draftPages === 1 ? 'page' : 'pages'} unpublished
            </div>
            <div class="mt-1 text-sm text-gray-500">Reachable by you, not by anyone else</div>
          </a>
        {/if}
      </div>
    </div>
  {/if}
</div>
