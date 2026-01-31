<script lang="ts">
	import type { Component } from 'svelte';
	import type { Profile, Link, TourDate } from '$lib/server/schema';

	let {
		layout: Layout,
		profile,
		links = [],
		tourDates = [],
		pressKitAvailable = false
	}: {
		layout: Component<{ profile: Profile; links: Link[]; tourDates: TourDate[]; pressKitAvailable?: boolean }>;
		profile: Partial<Profile> & { name: string };
		links?: Link[];
		tourDates?: TourDate[];
		pressKitAvailable?: boolean;
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
		backgroundUrl: profile.backgroundUrl ?? null,
		colorBg: profile.colorBg ?? '#0f0f0f',
		colorCard: profile.colorCard ?? '#1a1a1a',
		colorAccent: profile.colorAccent ?? '#8b5cf6',
		colorText: profile.colorText ?? '#ffffff',
		colorTextMuted: profile.colorTextMuted ?? '#9ca3af',
		showName: profile.showName ?? true,
		showLogo: profile.showLogo ?? true,
		showPhoto: profile.showPhoto ?? true,
		showBio: profile.showBio ?? true,
		showStreaming: profile.showStreaming ?? true,
		showSocial: profile.showSocial ?? true,
		showTourDates: profile.showTourDates ?? true,
		showPressKit: profile.showPressKit ?? false,
		layout: profile.layout ?? 'default'
	} as Profile);
</script>

<div
	class="preview-container"
	style="
		--color-bg: {previewProfile.colorBg};
		--color-card: {previewProfile.colorCard};
		--color-accent: {previewProfile.colorAccent};
		--color-text: {previewProfile.colorText};
		--color-text-muted: {previewProfile.colorTextMuted};
	"
>
	<Layout profile={previewProfile} {links} {tourDates} {pressKitAvailable} />
</div>

<style>
	.preview-container {
		min-height: 100%;
		background-color: var(--color-bg);
	}
</style>
