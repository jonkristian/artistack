<script lang="ts">
	import type { Component } from 'svelte';
	import type { Profile, Settings, Link, TourDate, Block, Media } from '$lib/server/schema';

	let {
		layout: Layout,
		profile,
		settings = null,
		links = [],
		tourDates = [],
		blocks = [],
		media = []
	}: {
		layout: Component<{ profile: Profile; settings?: Settings | null; links: Link[]; tourDates: TourDate[]; blocks?: Block[]; media?: Media[] }>;
		profile: Partial<Profile> & { name: string };
		settings?: Partial<Settings> | null;
		links?: Link[];
		tourDates?: TourDate[];
		blocks?: Block[];
		media?: Media[];
	} = $props();

	// Build a complete profile object with defaults for preview
	const previewProfile = $derived({
		id: 1,
		name: profile.name || 'Artist Name',
		bio: profile.bio ?? null,
		email: profile.email ?? null,
		logoUrl: profile.logoUrl ?? null,
		logoShape: profile.logoShape ?? 'circle',
		photoUrl: profile.photoUrl ?? null,
		photoShape: profile.photoShape ?? 'wide-rounded',
		backgroundUrl: profile.backgroundUrl ?? null
	} as Profile);

	const previewSettings = $derived({
		id: 1,
		colorBg: settings?.colorBg ?? '#0f0f0f',
		colorCard: settings?.colorCard ?? '#1a1a1a',
		colorAccent: settings?.colorAccent ?? '#8b5cf6',
		colorText: settings?.colorText ?? '#ffffff',
		colorTextMuted: settings?.colorTextMuted ?? '#9ca3af',
		layout: settings?.layout ?? 'default'
	} as Settings);
</script>

<div
	class="preview-container"
	style="
		--color-bg: {previewSettings.colorBg};
		--color-card: {previewSettings.colorCard};
		--color-accent: {previewSettings.colorAccent};
		--color-text: {previewSettings.colorText};
		--color-text-muted: {previewSettings.colorTextMuted};
	"
>
	<Layout profile={previewProfile} settings={previewSettings} {links} {tourDates} {blocks} {media} />
</div>

<style>
	.preview-container {
		min-height: 100%;
		background-color: var(--color-bg);
	}
</style>
