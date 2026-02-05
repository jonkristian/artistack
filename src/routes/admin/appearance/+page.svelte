<script lang="ts">
	import { ColorWheel, LayoutPreview } from '$lib/components/ui';
	import { SectionCard } from '$lib/components/cards';
	import Default from '$lib/themes/Default.svelte';
	import type { PageData } from './$types';
	import { updateAppearance } from './data.remote';

	let { data }: { data: PageData } = $props();

	// Initialize state directly from settings data
	const s = data.settings;

	// Colors
	let colorBg = $state(s?.colorBg ?? '#0f0f0f');
	let colorCard = $state(s?.colorCard ?? '#1a1a1a');
	let colorAccent = $state(s?.colorAccent ?? '#8b5cf6');
	let colorText = $state(s?.colorText ?? '#ffffff');
	let colorTextMuted = $state(s?.colorTextMuted ?? '#9ca3af');

	// Track which color picker is open (accordion behavior)
	let openPicker = $state<string | null>(null);

	// Layout
	let layout = $state<'default' | 'minimal' | 'card'>((s?.layout as 'default' | 'minimal' | 'card') ?? 'default');

	// Available layouts
	const availableLayouts = [
		{ id: 'default', name: 'Default', description: 'Classic centered layout with photo and links' }
		// Add more layouts here as they're created
	];

	const p = data.profile;

	// Live preview profile
	const liveProfile = $derived({
		...p,
		name: p?.name ?? 'Artist Name'
	});

	// Live preview settings (merges form state with saved data)
	const liveSettings = $derived({
		...s,
		colorBg,
		colorCard,
		colorAccent,
		colorText,
		colorTextMuted,
		layout
	});

	// Auto-save with debounce
	let saveTimeout: ReturnType<typeof setTimeout>;
	let initialized = false;

	$effect(() => {
		const values = { colorBg, colorCard, colorAccent, colorText, colorTextMuted, layout };

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
			<p class="text-sm text-gray-500">Customize colors and layout for your page</p>
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
	<div class="w-1/2 overflow-y-auto border-l border-gray-800" style="background-color: {colorBg}">
		<LayoutPreview
			layout={Default}
			profile={liveProfile}
			settings={liveSettings}
			links={data.links}
			tourDates={data.tourDates}
			blocks={data.blocks}
			media={data.media}
		/>
	</div>
</div>
