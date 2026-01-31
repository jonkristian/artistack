<script lang="ts">
	import { SectionCard } from '$lib/components/cards';
	import type { PageData } from './$types';
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { refreshSocialStats } from './data.remote';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';

	let { data }: { data: PageData } = $props();

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

	// uPlot chart
	let chartContainer: HTMLDivElement;
	let chart: uPlot | null = null;

	function createChart() {
		if (!chartContainer) return;
		if (chartContainer.clientWidth === 0) return;

		// Generate all dates for the last 30 days
		const now = new Date();
		const days = 30;
		const allDates: number[] = [];
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			d.setHours(0, 0, 0, 0);
			allDates.push(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000);
		}

		// Create lookup maps for current and previous period
		const currentMap = new Map<string, number>();
		for (const d of data.pageViews.viewsByDay) {
			currentMap.set(d.date, d.count);
		}

		const previousMap = new Map<string, number>();
		for (const d of data.previousPeriodViews) {
			previousMap.set(d.date, d.count);
		}

		// Build values arrays aligned to the date range
		const currentValues: number[] = [];
		const previousValues: number[] = [];

		for (let i = days - 1; i >= 0; i--) {
			const currentDate = new Date(now);
			currentDate.setDate(currentDate.getDate() - i);
			const currentKey = currentDate.toISOString().split('T')[0];
			currentValues.push(currentMap.get(currentKey) ?? 0);

			// Previous period: 30 days before the current date
			const prevDate = new Date(currentDate);
			prevDate.setDate(prevDate.getDate() - days);
			const prevKey = prevDate.toISOString().split('T')[0];
			previousValues.push(previousMap.get(prevKey) ?? 0);
		}

		const allValues = [...currentValues, ...previousValues];
		const maxValue = Math.max(...allValues, 10);

		const opts: uPlot.Options = {
			width: chartContainer.clientWidth,
			height: 200,
			class: 'uplot-chart',
			padding: [10, 10, 0, 0],
			cursor: {
				show: true,
				points: { show: true }
			},
			scales: {
				x: { time: true },
				y: {
					min: 0,
					max: maxValue
				}
			},
			axes: [
				{
					stroke: '#6b7280',
					grid: { stroke: '#374151', width: 1 },
					ticks: { stroke: '#374151' },
					font: '10px system-ui',
					values: (_, ticks) =>
						ticks.map((t) => {
							const d = new Date(t * 1000);
							return `${d.getDate()}/${d.getMonth() + 1}`;
						})
				},
				{
					stroke: '#6b7280',
					grid: { stroke: '#374151', width: 1, dash: [4, 4] },
					ticks: { stroke: '#374151' },
					font: '10px system-ui',
					size: 40
				}
			],
			series: [
				{},
				{
					label: 'This period',
					stroke: '#8b5cf6',
					width: 1,
					fill: 'rgba(139, 92, 246, 0.15)',
					paths: uPlot.paths.spline?.(),
					points: { show: false }
				},
				{
					label: 'Previous period',
					stroke: '#60a5fa',
					width: 1,
					dash: [6, 4],
					paths: uPlot.paths.spline?.(),
					points: { show: false }
				}
			]
		};

		// Destroy previous chart if exists
		if (chart) {
			chart.destroy();
		}

		const chartData: uPlot.AlignedData = [
			new Float64Array(allDates),
			new Float64Array(currentValues),
			new Float64Array(previousValues)
		];
		chart = new uPlot(opts, chartData, chartContainer);
	}

	onMount(() => {
		// Create chart after mount
		tick().then(() => {
			createChart();
		});

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			if (chart && chartContainer) {
				chart.setSize({ width: chartContainer.clientWidth, height: 200 });
			}
		});

		if (chartContainer) {
			resizeObserver.observe(chartContainer);
		}

		return () => {
			resizeObserver.disconnect();
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	// Re-create chart when data changes
	$effect(() => {
		// Access data to track changes
		const _ = data.pageViews.viewsByDay;
		const __ = data.previousPeriodViews;
		if (chartContainer) {
			tick().then(() => createChart());
		}
	});

	// Format numbers with K/M suffixes
	function formatNumber(n: number): string {
		if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
		if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
		return n.toString();
	}

	// Country code to name mapping (common countries)
	const countryNames: Record<string, string> = {
		US: 'United States',
		GB: 'United Kingdom',
		DE: 'Germany',
		FR: 'France',
		CA: 'Canada',
		AU: 'Australia',
		NL: 'Netherlands',
		SE: 'Sweden',
		NO: 'Norway',
		DK: 'Denmark',
		FI: 'Finland',
		ES: 'Spain',
		IT: 'Italy',
		BR: 'Brazil',
		MX: 'Mexico',
		JP: 'Japan',
		KR: 'South Korea',
		IN: 'India',
		RU: 'Russia',
		PL: 'Poland',
		BE: 'Belgium',
		CH: 'Switzerland',
		AT: 'Austria',
		IE: 'Ireland',
		NZ: 'New Zealand',
		PT: 'Portugal'
	};

	function getCountryName(code: string): string {
		return countryNames[code] || code;
	}

</script>

<div class="min-h-screen bg-gray-950 p-6">
	<header class="mb-6">
		<h1 class="text-2xl font-semibold text-white">Stats</h1>
		<p class="text-sm text-gray-500">Analytics and insights for your site</p>
	</header>

	<div class="space-y-6">
		<!-- Overview Cards -->
		<div class="grid grid-cols-4 gap-4">
			<!-- Page Views -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
				<div class="text-sm text-gray-400">Page Views (30d)</div>
				<div class="mt-2 text-3xl font-bold text-white">{formatNumber(data.overview.monthViews)}</div>
				<div class="mt-1 flex items-center gap-1 text-sm {data.viewsChange >= 0 ? 'text-green-400' : 'text-red-400'}">
					{#if data.viewsChange >= 0}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
						</svg>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
						</svg>
					{/if}
					{Math.abs(data.viewsChange)}% vs previous period
				</div>
			</div>

			<!-- Link Clicks -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
				<div class="text-sm text-gray-400">Link Clicks (30d)</div>
				<div class="mt-2 text-3xl font-bold text-white">{formatNumber(data.overview.monthClicks)}</div>
				<div class="mt-1 flex items-center gap-1 text-sm {data.clicksChange >= 0 ? 'text-green-400' : 'text-red-400'}">
					{#if data.clicksChange >= 0}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
						</svg>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
						</svg>
					{/if}
					{Math.abs(data.clicksChange)}% vs previous period
				</div>
			</div>

			<!-- Top Referrer -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
				<div class="text-sm text-gray-400">Top Referrer</div>
				<div class="mt-2 truncate text-xl font-bold text-white">
					{data.overview.topReferrer ?? 'No data yet'}
				</div>
				<div class="mt-1 text-sm text-gray-500">Last 30 days</div>
			</div>

			<!-- Top Link -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
				<div class="text-sm text-gray-400">Most Clicked</div>
				<div class="mt-2 truncate text-xl font-bold text-white">
					{data.overview.topLink?.label ?? data.overview.topLink?.platform ?? 'No clicks yet'}
				</div>
				{#if data.overview.topLink}
					<div class="mt-1 text-sm text-gray-500">{data.overview.topLink.clicks} clicks</div>
				{:else}
					<div class="mt-1 text-sm text-gray-500">Last 30 days</div>
				{/if}
			</div>
		</div>

		<!-- Page Views Chart -->
		<SectionCard title="Page Views (Last 30 Days)">
			<div bind:this={chartContainer} class="w-full"></div>
			<div class="mt-3 flex items-center gap-6 text-xs text-gray-400">
				<div class="flex items-center gap-2">
					<span class="h-0.5 w-4 bg-purple-500"></span>
					<span>This period</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="h-0.5 w-4 border-t-2 border-dashed border-blue-400"></span>
					<span>Previous 30 days</span>
				</div>
			</div>
		</SectionCard>

		<!-- Two column layout for referrers and geography -->
		<div class="grid grid-cols-2 gap-6">
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
		</div>

		<!-- Link Clicks -->
		<SectionCard title="Link Clicks (Last 30 Days)">
			{#if data.linkClicks.clicksByLink.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-gray-800 text-left text-xs uppercase text-gray-400">
								<th class="pb-3 font-medium">Link</th>
								<th class="pb-3 font-medium">Platform</th>
								<th class="pb-3 pr-4 text-right font-medium">Clicks</th>
								<th class="pb-3 font-medium">% of Total</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-800">
							{#each data.linkClicks.clicksByLink as link}
								<tr>
									<td class="py-3 text-sm text-white">{link.label ?? 'Unnamed'}</td>
									<td class="py-3 text-sm capitalize text-gray-400">{link.platform}</td>
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
					No link click data yet. Add trackable links using /go/[id] URLs.
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
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						{refreshing ? 'Refreshing...' : 'Refresh'}
					</button>
				{/snippet}
				<div class="grid grid-cols-2 gap-4">
					<!-- Spotify Stats -->
					{#if data.socialStats.spotify}
						<div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
							<div class="mb-3 flex items-center gap-2">
								<svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #1DB954">
									<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
								</svg>
								<span class="font-medium text-white">Spotify</span>
							</div>
							<div class="space-y-2">
								<div class="flex justify-between">
									<span class="text-sm text-gray-400">Followers</span>
									<span class="font-medium text-white">{formatNumber(data.socialStats.spotify.followers)}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-sm text-gray-400">Popularity</span>
									<span class="font-medium text-white">{data.socialStats.spotify.popularity}/100</span>
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
									<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
									<path fill="#FFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
								</svg>
								<span class="font-medium text-white">YouTube</span>
							</div>
							<div class="space-y-2">
								<div class="flex justify-between">
									<span class="text-sm text-gray-400">Subscribers</span>
									<span class="font-medium text-white">{formatNumber(data.socialStats.youtube.subscriberCount)}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-sm text-gray-400">Total Views</span>
									<span class="font-medium text-white">{formatNumber(data.socialStats.youtube.viewCount)}</span>
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
													<span class="shrink-0 text-xs text-gray-500">{formatNumber(video.viewCount)}</span>
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
					Manage connections in <a href="/admin/integrations" class="text-purple-400 hover:underline">Integrations</a>
				</p>
			</SectionCard>
		{/if}

	</div>
</div>

<style>
	/* uPlot dark theme overrides */
	:global(.uplot-chart) {
		background: transparent;
	}
	:global(.uplot-chart .u-legend) {
		display: none;
	}
</style>
