<script lang="ts">
	import { SectionCard } from '$lib/components/cards';
	import type { PageData } from './$types';
	import { updateSettings } from './data.remote';

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

	// Sync from data.profile on load
	let syncedProfileId: number | null = null;
	$effect(() => {
		if (data.profile && data.profile.id !== syncedProfileId) {
			syncedProfileId = data.profile.id;
			locale = data.profile.locale ?? 'nb-NO';
			googlePlacesApiKey = data.profile.googlePlacesApiKey ?? '';
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

		<div class="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
			<p class="text-xs text-gray-500">
				Regional settings affect how dates are displayed on your public page.
				The admin interface uses your browser's locale settings.
			</p>
		</div>
	</div>
</div>
