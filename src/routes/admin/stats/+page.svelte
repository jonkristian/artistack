<script lang="ts">
  import { platformLabel } from '$lib/utils/platforms';
  import { SectionCard } from '$lib/components/cards';
  import ViewsChart from '$lib/components/admin/ViewsChart.svelte';
  import type { PageData } from './$types';
  import { invalidateAll, goto } from '$app/navigation';
  import { refreshSocialStats } from './data.remote';

  let { data }: { data: PageData } = $props();

  const isYear = $derived(/^\d{4}$/.test(data.period));

  // Refresh state
  let refreshing = $state(false);

  async function handleRefresh() {
    refreshing = true;
    try {
      await refreshSocialStats({});
      await invalidateAll();
    } catch {
      // Silently fail
    }
    refreshing = false;
  }

  // Format numbers with K/M suffixes
  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // Use Intl API for complete country name resolution
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  function getCountryName(code: string): string {
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  }
</script>

<!-- Up or down against the window before. Absent for all time, which has none. -->
{#snippet trend(value: number | null)}
  {#if value !== null}
    <div
      class="mt-1 flex items-center gap-1 text-sm {value >= 0 ? 'text-green-400' : 'text-red-400'}"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d={value >= 0 ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'}
        />
      </svg>
      {Math.abs(value)}% vs {data.comparedTo}
    </div>
  {/if}
{/snippet}

<div class="min-h-screen bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]">
  <div class="space-y-6">
    <!-- The window everything below covers. Each is an address, so a period
         can be reloaded or sent to someone. Years sit between the rolling
         windows and all time, and only appear once there's more than one. -->
    <nav class="flex flex-wrap items-center gap-1" aria-label="Period">
      {#each data.periods as option (option.value)}
        {#if option.value === 'all' && data.years.length > 0}
          <select
            aria-label="Year"
            class="rounded-lg border-0 py-1.5 pr-8 pl-3 text-sm transition-colors {isYear
              ? 'bg-white/10 text-white'
              : 'bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'}"
            value={isYear ? data.period : ''}
            onchange={(e) => goto(`?period=${e.currentTarget.value}`, { noScroll: true })}
          >
            <option value="" disabled>Year</option>
            {#each data.years as year (year)}
              <option value={String(year)}>{year}</option>
            {/each}
          </select>
        {/if}
        <a
          href="?period={option.value}"
          data-sveltekit-noscroll
          aria-current={data.period === option.value ? 'page' : undefined}
          class="rounded-lg px-3 py-1.5 text-sm transition-colors {data.period === option.value
            ? 'bg-white/10 text-white'
            : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
        >
          {option.label}
        </a>
      {/each}
    </nav>

    <!-- Overview Cards -->
    <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-4">
      <!-- Page Views -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="text-sm text-gray-400">Page Views</div>
        <div class="mt-2 text-3xl font-bold text-white">
          {formatNumber(data.currentViews)}
        </div>
        <!-- People rather than hits. The number the view count is usually mistaken for. -->
        <div class="mt-1 text-sm text-gray-500">
          {formatNumber(data.pageViews.uniqueVisitors)} visitors
        </div>
        {@render trend(data.viewsChange)}
      </div>

      <!-- Link Clicks -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="text-sm text-gray-400">Link Clicks</div>
        <div class="mt-2 text-3xl font-bold text-white">
          {formatNumber(data.currentClicks)}
        </div>
        {@render trend(data.clicksChange)}
      </div>

      <!-- Top Referrer -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="text-sm text-gray-400">Top Referrer</div>
        <div class="mt-2 truncate text-xl font-bold text-white">
          {data.topReferrer ?? 'No data yet'}
        </div>
        <div class="mt-1 text-sm text-gray-500">{data.periodLabel}</div>
      </div>

      <!-- Top Link -->
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="text-sm text-gray-400">Most Clicked</div>
        <div class="mt-2 truncate text-xl font-bold text-white">
          {data.topLink
            ? (data.topLink.label ?? platformLabel(data.topLink.platform))
            : 'No clicks yet'}
        </div>
        <div class="mt-1 text-sm text-gray-500">
          {data.topLink ? `${data.topLink.count} clicks` : data.periodLabel}
        </div>
      </div>
    </div>

    <!-- Page Views Chart -->
    <SectionCard title="Page Views">
      <ViewsChart
        locale={data.settings?.locale || 'nb-NO'}
        days={data.days}
        from={data.from}
        previousFrom={data.previousFrom}
        previousLabel={isYear ? data.comparedTo : null}
        viewsByDay={data.pageViews.viewsByDay}
        previousViewsByDay={data.previousPeriodViews}
      />
    </SectionCard>

    <!-- Two column layout for pages, referrers and geography -->
    <div class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6">
      <!-- Top Pages. Clip campaign links are marked, since whether a posted
           clip brought anyone is the question they answer. -->
      <SectionCard title="Top Pages">
        {#if data.topPages.length > 0}
          <div class="space-y-3">
            {#each data.topPages as row (row.path)}
              <div class="flex items-center justify-between gap-3">
                <span class="flex min-w-0 items-center gap-2" title={row.path}>
                  <span class="truncate text-sm text-white">{row.label}</span>
                  {#if row.campaign}
                    <span class="shrink-0 text-xs text-violet-400">Clip</span>
                  {/if}
                </span>
                <div class="flex shrink-0 items-center gap-3">
                  <div class="h-2 w-24 overflow-hidden rounded-full bg-gray-700">
                    <div
                      class="h-full rounded-full bg-purple-500"
                      style="width: {(row.count / data.pageViews.totalViews) * 100}%"
                    ></div>
                  </div>
                  <span class="w-12 text-right text-sm text-gray-400">{row.count}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="py-8 text-center text-gray-500">No page views yet</div>
        {/if}
      </SectionCard>

      <!-- Top Referrers -->
      <SectionCard title="Top Referrers">
        {#if data.pageViews.viewsByReferrer.length > 0}
          <div class="space-y-3">
            {#each data.pageViews.viewsByReferrer as ref}
              <div class="flex items-center justify-between">
                <span class="truncate text-sm text-white">{ref.referrer}</span>
                <div class="flex items-center gap-3">
                  <div class="h-2 w-24 overflow-hidden rounded-full bg-gray-700">
                    <div
                      class="h-full rounded-full bg-purple-500"
                      style="width: {(ref.count / data.pageViews.totalViews) * 100}%"
                    ></div>
                  </div>
                  <span class="w-12 text-right text-sm text-gray-400">{ref.count}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="py-8 text-center text-gray-500">No referrer data yet</div>
        {/if}
      </SectionCard>

      <!-- Geographic Distribution -->
      <SectionCard title="Top Countries">
        {#if data.pageViews.viewsByCountry.length > 0}
          <div class="space-y-3">
            {#each data.pageViews.viewsByCountry as country}
              <div class="flex items-center justify-between">
                <span class="text-sm text-white">{getCountryName(country.country)}</span>
                <div class="flex items-center gap-3">
                  <div class="h-2 w-24 overflow-hidden rounded-full bg-gray-700">
                    <div
                      class="h-full rounded-full bg-purple-500"
                      style="width: {(country.count / data.pageViews.totalViews) * 100}%"
                    ></div>
                  </div>
                  <span class="w-12 text-right text-sm text-gray-400">{country.count}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="py-8 text-center text-gray-500">No geographic data yet</div>
        {/if}
      </SectionCard>

      <!-- Devices: whether people arrive on a phone decides what the page
           should be good at first. -->
      <SectionCard title="Devices">
        {#if data.pageViews.viewsByDevice.length > 0}
          <div class="space-y-3">
            {#each data.pageViews.viewsByDevice as row (row.device)}
              <div class="flex items-center justify-between">
                <span class="text-sm text-white capitalize">{row.device}</span>
                <div class="flex items-center gap-3">
                  <div class="h-2 w-24 overflow-hidden rounded-full bg-gray-700">
                    <div
                      class="h-full rounded-full bg-purple-500"
                      style="width: {(row.count / data.pageViews.totalViews) * 100}%"
                    ></div>
                  </div>
                  <span class="w-12 text-right text-sm text-gray-400">{row.count}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="py-8 text-center text-gray-500">No device data yet</div>
        {/if}
      </SectionCard>

      <!-- Only once something's been pressed: most sites have no pre-save up
           and no tickets on sale most of the time. -->
      {#if data.actionClicks.length > 0}
        <SectionCard title="Pre-saves & Tickets">
          <div class="space-y-3">
            {#each data.actionClicks as row (`${row.action}-${row.subjectId}`)}
              <div class="flex items-center justify-between gap-3">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm text-white">{row.label}</span>
                  <span class="shrink-0 text-xs text-violet-400">
                    {row.action === 'presave' ? 'Pre-save' : 'Tickets'}
                  </span>
                </span>
                <span class="w-12 shrink-0 text-right text-sm text-gray-400">{row.count}</span>
              </div>
            {/each}
          </div>
        </SectionCard>
      {/if}
    </div>

    <!-- Link Clicks -->
    <SectionCard title="Link Clicks">
      {#if data.linkClicks.clicksByLink.length > 0}
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
                <th class="pb-3 font-medium">Link</th>
                <th class="pb-3 font-medium">Platform</th>
                <th class="pr-4 pb-3 text-right font-medium">Clicks</th>
                <th class="pb-3 font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800">
              {#each data.linkClicks.clicksByLink as link}
                <tr>
                  <td class="py-3 text-sm text-white">
                    {link.label || platformLabel(link.platform) || 'Unnamed'}
                  </td>
                  <td class="py-3 text-sm text-gray-400">{platformLabel(link.platform)}</td>
                  <td class="py-3 pr-4 text-right text-sm text-white">{link.count}</td>
                  <td class="py-3">
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-20 overflow-hidden rounded-full bg-gray-700">
                        <div
                          class="h-full rounded-full bg-green-500"
                          style="width: {(link.count / data.linkClicks.totalClicks) * 100}%"
                        ></div>
                      </div>
                      <span class="text-xs text-gray-500">
                        {Math.round((link.count / data.linkClicks.totalClicks) * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="py-8 text-center text-gray-500">
          No link clicks yet. Every link on the site is counted as it's pressed.
        </div>
      {/if}
    </SectionCard>

    <!-- Social Media Stats -->
    {#if data.socialStats.spotify || data.socialStats.youtube}
      <SectionCard title="Social Media Stats">
        {#snippet actions()}
          <button
            onclick={handleRefresh}
            disabled={refreshing}
            class="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            <svg
              class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        {/snippet}
        <div
          class="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4"
        >
          <!-- Spotify Stats -->
          {#if data.socialStats.spotify}
            <div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #1DB954">
                  <path
                    d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                  />
                </svg>
                <span class="font-medium text-white">Spotify</span>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-400">Followers</span>
                  <span class="font-medium text-white"
                    >{formatNumber(data.socialStats.spotify.followers)}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-400">Popularity</span>
                  <span class="font-medium text-white"
                    >{data.socialStats.spotify.popularity}/100</span
                  >
                </div>
                {#if data.socialStats.spotify.topTracks && data.socialStats.spotify.topTracks.length > 0}
                  <div class="mt-3 border-t border-gray-800 pt-3">
                    <span class="text-xs text-gray-500">Top Tracks</span>
                    <ul class="mt-1 space-y-1">
                      {#each data.socialStats.spotify.topTracks.slice(0, 3) as track}
                        <li class="truncate text-sm text-gray-300">{track.name}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                <p class="mt-2 text-xs text-gray-600">
                  Updated: {new Date(data.socialStats.spotify.lastUpdated).toLocaleDateString()}
                </p>
              </div>
            </div>
          {/if}

          <!-- YouTube Stats -->
          {#if data.socialStats.youtube}
            <div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #FF0000">
                  <path
                    d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
                  />
                  <path fill="#FFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <span class="font-medium text-white">YouTube</span>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-400">Subscribers</span>
                  <span class="font-medium text-white"
                    >{formatNumber(data.socialStats.youtube.subscriberCount)}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-400">Total Views</span>
                  <span class="font-medium text-white"
                    >{formatNumber(data.socialStats.youtube.viewCount)}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-400">Videos</span>
                  <span class="font-medium text-white">{data.socialStats.youtube.videoCount}</span>
                </div>
                {#if data.socialStats.youtube.recentVideos && data.socialStats.youtube.recentVideos.length > 0}
                  <div class="mt-3 border-t border-gray-800 pt-3">
                    <span class="text-xs text-gray-500">Recent Videos</span>
                    <ul class="mt-1 space-y-1">
                      {#each data.socialStats.youtube.recentVideos.slice(0, 3) as video}
                        <li class="flex items-center justify-between gap-2 text-sm">
                          <span class="truncate text-gray-300">{video.title}</span>
                          <span class="shrink-0 text-xs text-gray-500"
                            >{formatNumber(video.viewCount)}</span
                          >
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                <p class="mt-2 text-xs text-gray-600">
                  Updated: {new Date(data.socialStats.youtube.lastUpdated).toLocaleDateString()}
                </p>
              </div>
            </div>
          {/if}
        </div>
        <p class="mt-4 text-xs text-gray-500">
          Manage connections in <a
            href="/admin/settings/integrations"
            class="text-purple-400 hover:underline">Integrations</a
          >
        </p>
      </SectionCard>
    {/if}
  </div>
</div>
