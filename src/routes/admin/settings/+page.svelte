<script lang="ts">
	import { SectionCard } from '$lib/components/cards';
	import type { PageData } from './$types';
	import { updateSettings, generateFavicon } from './data.remote';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// Available locales
	const locales = [
		{ code: 'nb-NO', name: 'Norwegian (Bokmål)', example: '31. jan. 2026' },
		{ code: 'en-GB', name: 'English (UK)', example: '31 Jan 2026' },
		{ code: 'en-US', name: 'English (US)', example: 'Jan 31, 2026' },
		{ code: 'de-DE', name: 'German', example: '31. Jan. 2026' },
		{ code: 'sv-SE', name: 'Swedish', example: '31 jan. 2026' },
		{ code: 'da-DK', name: 'Danish', example: '31. jan. 2026' },
		{ code: 'fi-FI', name: 'Finnish', example: '31. tammik. 2026' },
		{ code: 'fr-FR', name: 'French', example: '31 janv. 2026' },
		{ code: 'es-ES', name: 'Spanish', example: '31 ene 2026' },
		{ code: 'nl-NL', name: 'Dutch', example: '31 jan. 2026' }
	];

	// Current locale
	let locale = $state('nb-NO');
	let googlePlacesApiKey = $state('');

	// Favicon state
	let selectedFaviconUrl = $state<string | null>(null);
	let faviconGenerated = $state(false);
	let isGenerating = $state(false);
	let mediaDisplayCount = $state(12); // Show 12 images initially

	// Paginated media for favicon selection
	const visibleMedia = $derived(data.media?.slice(0, mediaDisplayCount) ?? []);
	const hasMoreMedia = $derived((data.media?.length ?? 0) > mediaDisplayCount);

	// Sync from data.profile on load
	let syncedProfileId: number | null = null;
	$effect(() => {
		if (data.profile && data.profile.id !== syncedProfileId) {
			syncedProfileId = data.profile.id;
			locale = data.profile.locale ?? 'nb-NO';
			googlePlacesApiKey = data.profile.googlePlacesApiKey ?? '';
			selectedFaviconUrl = data.profile.faviconUrl ?? null;
			faviconGenerated = data.profile.faviconGenerated ?? false;
		}
	});

	// Auto-save with debounce
	let saveTimeout: ReturnType<typeof setTimeout>;
	let initialized = false;

	$effect(() => {
		// Track values to trigger on change
		const values = { locale, googlePlacesApiKey: googlePlacesApiKey || null };

		if (!initialized) {
			initialized = true;
			return;
		}

		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await updateSettings(values);
		}, 500);
	});

	// Get current locale info
	const currentLocale = $derived(locales.find(l => l.code === locale) ?? locales[0]);

	// Handle favicon generation
	async function handleGenerateFavicon() {
		if (!selectedFaviconUrl) return;

		isGenerating = true;
		try {
			await generateFavicon({ sourceUrl: selectedFaviconUrl });
			faviconGenerated = true;
			await invalidateAll();
		} catch (error) {
			console.error('Failed to generate favicon:', error);
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="min-h-screen bg-gray-950 p-6">
	<header class="mb-6">
		<h1 class="text-2xl font-semibold text-white">Settings</h1>
		<p class="text-sm text-gray-500">Configure system preferences</p>
	</header>

	<div class="max-w-2xl space-y-6">
		<SectionCard title="Regional">
			<div class="space-y-4">
				<div>
					<label for="locale" class="mb-2 block text-sm font-medium text-gray-300">
						Date & Time Format
					</label>
					<select
						id="locale"
						bind:value={locale}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-gray-600 focus:outline-none"
					>
						{#each locales as l (l.code)}
							<option value={l.code}>{l.name}</option>
						{/each}
					</select>
					<p class="mt-2 text-sm text-gray-500">
						Example: <span class="text-gray-400">{currentLocale.example}</span>
					</p>
				</div>
			</div>
		</SectionCard>

		<SectionCard title="Integrations">
			<div class="space-y-4">
				<div>
					<label for="google-places-api-key" class="mb-2 block text-sm font-medium text-gray-300">
						Google Places API Key
					</label>
					<input
						id="google-places-api-key"
						type="password"
						bind:value={googlePlacesApiKey}
						placeholder="AIza..."
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
					<p class="mt-2 text-sm text-gray-500">
						Enables venue autocomplete when adding tour dates.
						Get a key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" class="text-violet-400 hover:text-violet-300">Google Cloud Console</a>.
					</p>
				</div>
			</div>
		</SectionCard>

		<SectionCard title="Favicon & PWA">
			<div class="space-y-4">
				<p class="text-sm text-gray-400">
					Select an image from your media library to generate a favicon and PWA icons.
					This will create icons for browser tabs, bookmarks, and mobile home screens.
				</p>

				{#if data.media && data.media.length > 0}
					<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800/30 p-2">
						<div class="grid grid-cols-6 gap-2">
							{#each visibleMedia as item (item.id)}
								<button
									type="button"
									onclick={() => (selectedFaviconUrl = item.url)}
									class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-all {selectedFaviconUrl === item.url ? 'border-violet-500 ring-2 ring-violet-500/50' : 'border-gray-700 hover:border-gray-600'}"
								>
									<img
										src={item.thumbnailUrl || item.url}
										alt={item.alt || item.filename}
										class="h-full w-full object-cover"
									/>
									{#if selectedFaviconUrl === item.url}
										<div class="absolute inset-0 flex items-center justify-center bg-violet-500/20">
											<svg class="h-6 w-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
											</svg>
										</div>
									{/if}
								</button>
							{/each}
						</div>

						{#if hasMoreMedia}
							<button
								type="button"
								onclick={() => (mediaDisplayCount += 12)}
								class="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
							>
								Load more ({data.media.length - mediaDisplayCount} remaining)
							</button>
						{/if}
					</div>
				{:else}
					<p class="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-center text-sm text-gray-500">
						No images in media library. Upload images in the <a href="/admin/media" class="text-violet-400 hover:text-violet-300">Media</a> section first.
					</p>
				{/if}

				<div class="flex items-center gap-4">
					<button
						type="button"
						onclick={handleGenerateFavicon}
						disabled={!selectedFaviconUrl || isGenerating}
						class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isGenerating}
							Generating...
						{:else}
							Generate Favicon
						{/if}
					</button>

					{#if faviconGenerated}
						<span class="flex items-center gap-1.5 text-sm text-emerald-400">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							Favicon generated
						</span>
					{/if}
				</div>

				{#if faviconGenerated && selectedFaviconUrl}
					<div class="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
						<div class="flex gap-2">
							<img src="/favicon-32.png" alt="Favicon 32x32" class="h-8 w-8 rounded" />
							<img src="/icon-192.png" alt="Icon 192x192" class="h-8 w-8 rounded" />
						</div>
						<div class="text-sm text-gray-400">
							<p>Generated files: favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png</p>
							<p class="text-xs text-gray-500">PWA manifest available at /manifest.json</p>
						</div>
					</div>
				{/if}
			</div>
		</SectionCard>

		<div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
			<p class="text-xs text-gray-500">
				Regional settings affect how dates are displayed on your public page.
				The admin interface uses your browser's locale settings.
			</p>
		</div>
	</div>
</div>
