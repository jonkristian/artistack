<script lang="ts">
	import { ColorWheel, ToggleOption, LayoutPreview } from '$lib/components/ui';
	import { SectionCard } from '$lib/components/cards';
	import Default from '$lib/themes/Default.svelte';
	import type { PageData } from './$types';
	import { updateAppearance } from './data.remote';

	let { data }: { data: PageData } = $props();

	// Colors
	let colorBg = $state('#0f0f0f');
	let colorCard = $state('#1a1a1a');
	let colorAccent = $state('#8b5cf6');
	let colorText = $state('#ffffff');
	let colorTextMuted = $state('#9ca3af');

	// Track which color picker is open (accordion behavior)
	let openPicker = $state<string | null>(null);

	// Display options
	let showName = $state(true);
	let showLogo = $state(true);
	let showPhoto = $state(true);
	let showBio = $state(true);
	let showStreaming = $state(true);
	let showSocial = $state(true);
	let showTourDates = $state(true);

	// Layout
	let layout = $state('default');

	// Sync from data.profile on load (only when profile id changes)
	let syncedProfileId: number | null = null;
	$effect(() => {
		if (data.profile && data.profile.id !== syncedProfileId) {
			syncedProfileId = data.profile.id;
			colorBg = data.profile.colorBg ?? '#0f0f0f';
			colorCard = data.profile.colorCard ?? '#1a1a1a';
			colorAccent = data.profile.colorAccent ?? '#8b5cf6';
			colorText = data.profile.colorText ?? '#ffffff';
			colorTextMuted = data.profile.colorTextMuted ?? '#9ca3af';
			showName = data.profile.showName ?? true;
			showLogo = data.profile.showLogo ?? true;
			showPhoto = data.profile.showPhoto ?? true;
			showBio = data.profile.showBio ?? true;
			showStreaming = data.profile.showStreaming ?? true;
			showSocial = data.profile.showSocial ?? true;
			showTourDates = data.profile.showTourDates ?? true;
			layout = data.profile.layout ?? 'default';
		}
	});

	// Available layouts
	const availableLayouts = [
		{ id: 'default', name: 'Default', description: 'Classic centered layout with photo and links' }
		// Add more layouts here as they're created
	];

	// Live preview profile (merges form state with saved data)
	const liveProfile = $derived({
		...data.profile,
		name: data.profile?.name ?? 'Artist Name',
		colorBg,
		colorCard,
		colorAccent,
		colorText,
		colorTextMuted,
		showName,
		showLogo,
		showPhoto,
		showBio,
		showStreaming,
		showSocial,
		showTourDates,
		layout
	});

	// Auto-save with debounce
	let saveTimeout: ReturnType<typeof setTimeout>;
	let initialized = false;

	$effect(() => {
		// Track all values to trigger on any change
		const values = { colorBg, colorCard, colorAccent, colorText, colorTextMuted, showName, showLogo, showPhoto, showBio, showStreaming, showSocial, showTourDates, layout };

		if (!initialized) {
			initialized = true;
			return;
		}

		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await updateAppearance(values);
		}, 500);
	});
</script>

<div class="flex h-screen">
	<!-- Left Column: Settings -->
	<div class="w-1/2 overflow-y-auto bg-gray-950 p-6">
		<header class="mb-6">
			<h1 class="text-2xl font-semibold text-white">Appearance</h1>
			<p class="text-sm text-gray-500">Customize colors and display options for your page</p>
		</header>

		<div class="space-y-6">
		<!-- Colors -->
		<SectionCard title="Colors">
			<div class="flex flex-wrap gap-4">
				<ColorWheel value={colorBg} onchange={(c) => (colorBg = c)} label="Background" open={openPicker === 'bg'} ontoggle={(o) => (openPicker = o ? 'bg' : null)} />
				<ColorWheel value={colorCard} onchange={(c) => (colorCard = c)} label="Card" open={openPicker === 'card'} ontoggle={(o) => (openPicker = o ? 'card' : null)} />
				<ColorWheel value={colorAccent} onchange={(c) => (colorAccent = c)} label="Accent" open={openPicker === 'accent'} ontoggle={(o) => (openPicker = o ? 'accent' : null)} />
				<ColorWheel value={colorText} onchange={(c) => (colorText = c)} label="Text" open={openPicker === 'text'} ontoggle={(o) => (openPicker = o ? 'text' : null)} />
				<ColorWheel value={colorTextMuted} onchange={(c) => (colorTextMuted = c)} label="Muted" open={openPicker === 'muted'} ontoggle={(o) => (openPicker = o ? 'muted' : null)} />
			</div>
		</SectionCard>

		<!-- Display Options -->
		<SectionCard title="Display">
			<div class="space-y-4">
				<!-- Header Section -->
				<div class="space-y-3">
					<h3 class="text-xs font-medium text-gray-500">Header</h3>
					<ToggleOption label="Show Photo" description="Display your band/artist photo" bind:checked={showPhoto} />
					<ToggleOption label="Show Logo" description="Display your logo image" bind:checked={showLogo} />
					<ToggleOption label="Show Artist Name" description="Display your name/band name" bind:checked={showName} />
					<ToggleOption label="Show Bio" description="Display your bio/tagline" bind:checked={showBio} />
				</div>

				<!-- Sections -->
				<div class="space-y-3 border-t border-gray-800 pt-4">
					<h3 class="text-xs font-medium text-gray-500">Sections</h3>
					<ToggleOption label="Streaming Links" description="Spotify, Apple Music, YouTube, etc." bind:checked={showStreaming} />
					<ToggleOption label="Social Media" description="Instagram, TikTok, Twitter, etc." bind:checked={showSocial} />
					<ToggleOption label="Tour Dates" description="Upcoming shows and events" bind:checked={showTourDates} />
				</div>
			</div>
		</SectionCard>

		<!-- Layout -->
		<SectionCard title="Layout">
			<div class="space-y-2">
				{#each availableLayouts as l (l.id)}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 transition-colors {layout === l.id ? 'bg-white/10 ring-1 ring-white/20' : 'bg-gray-800/50 hover:bg-gray-800'}"
					>
						<input
							type="radio"
							name="layout"
							value={l.id}
							bind:group={layout}
							class="h-4 w-4 border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
						/>
						<div>
							<span class="text-sm font-medium text-white">{l.name}</span>
							<p class="text-xs text-gray-500">{l.description}</p>
						</div>
					</label>
				{/each}
			</div>
			{#if availableLayouts.length === 1}
				<p class="mt-3 text-xs text-gray-600">More layouts coming soon</p>
			{/if}
		</SectionCard>
		</div>
	</div>

	<!-- Right Column: Live Preview -->
	<div class="w-1/2 overflow-y-auto border-l border-gray-800">
		<LayoutPreview
			layout={Default}
			profile={liveProfile}
			links={data.links}
			tourDates={data.tourDates}
		/>
	</div>
</div>
