<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-screen bg-gray-950 p-6">
	<!-- Page Header -->
	<header class="mb-6">
		<h1 class="text-2xl font-semibold text-white">Integrations</h1>
		<p class="text-sm text-gray-500">Connect external services to automatically sync content</p>
	</header>

	<div class="max-w-2xl space-y-6">
		<!-- Info about link metadata -->
		<section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
			<div class="flex items-center gap-3 mb-4">
				<svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
				</svg>
				<div>
					<h2 class="font-semibold text-white">Automatic Metadata</h2>
					<p class="text-xs text-gray-500">Thumbnails and titles are fetched automatically</p>
				</div>
			</div>
			<p class="text-sm text-gray-400">
				When you add streaming links, metadata (thumbnails, titles) is automatically fetched for:
			</p>
			<ul class="mt-3 space-y-2 text-sm text-gray-400">
				<li class="flex items-center gap-2">
					<svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #1DB954">
						<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
					</svg>
					Spotify (albums, tracks, playlists)
				</li>
				<li class="flex items-center gap-2">
					<svg viewBox="0 0 24 24" class="h-5 w-5" style="fill: #FF0000">
						<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
					</svg>
					YouTube & YouTube Music
				</li>
			</ul>
			<p class="mt-4 text-xs text-gray-500">
				Just paste the URL when adding a streaming link and the thumbnail will be fetched automatically.
			</p>
		</section>

		<!-- Facebook Events (placeholder) -->
		<section class="rounded-xl border border-gray-800 bg-gray-900 p-5 opacity-50">
			<div class="flex items-center gap-3">
				<svg viewBox="0 0 24 24" class="h-8 w-8" style="fill: #1877F2">
					<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
				</svg>
				<div class="flex-1">
					<h2 class="font-semibold text-white">Facebook Events</h2>
					<p class="text-xs text-gray-500">Sync tour dates from your Facebook Page</p>
				</div>
				<span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">Coming Soon</span>
			</div>
		</section>

		<!-- Bandsintown (placeholder) -->
		<section class="rounded-xl border border-gray-800 bg-gray-900 p-5 opacity-50">
			<div class="flex items-center gap-3">
				<div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#00CEC8]">
					<span class="text-sm font-bold text-black">B</span>
				</div>
				<div class="flex-1">
					<h2 class="font-semibold text-white">Bandsintown</h2>
					<p class="text-xs text-gray-500">Import events from Bandsintown</p>
				</div>
				<span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-400">Coming Soon</span>
			</div>
		</section>
	</div>
</div>
