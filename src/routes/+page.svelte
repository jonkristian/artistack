<script lang="ts">
	import type { PageData } from './$types';
	import Default from '$lib/themes/Default.svelte';

	let { data }: { data: PageData } = $props();

	const profile = $derived(data.profile);
	const links = $derived(data.links);
	const tourDates = $derived(data.tourDates);
	const pressKitAvailable = $derived(data.pressKitAvailable ?? false);

	// SEO
	const pageTitle = $derived(profile?.siteTitle || profile?.name || 'Artist');
	const pageDescription = $derived(profile?.bio ?? `Check out ${profile?.name ?? 'this artist'} - links, music, and more.`);

	// Layout components registry - add new layouts here
	const layouts = {
		default: Default
		// Add more layouts: minimal: Minimal, bold: Bold, etc.
	} as const;

	const Layout = $derived(layouts[(profile?.layout as keyof typeof layouts) ?? 'default'] ?? Default);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:type" content="profile" />
	{#if profile?.photoUrl}
		<meta property="og:image" content={profile.photoUrl} />
	{:else if profile?.logoUrl}
		<meta property="og:image" content={profile.logoUrl} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	{#if profile?.photoUrl}
		<meta name="twitter:image" content={profile.photoUrl} />
	{:else if profile?.logoUrl}
		<meta name="twitter:image" content={profile.logoUrl} />
	{/if}
	{@html `<style>html, body { background-color: ${profile?.colorBg ?? '#0f0f0f'}; }</style>`}
</svelte:head>

<div class="pointer-events-none fixed inset-0 z-50 opacity-[0.04]" style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 512 512%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"></div>
<div
	style="
		--color-bg: {profile?.colorBg ?? '#0f0f0f'};
		--color-card: {profile?.colorCard ?? '#1a1a1a'};
		--color-accent: {profile?.colorAccent ?? '#8b5cf6'};
		--color-text: {profile?.colorText ?? '#ffffff'};
		--color-text-muted: {profile?.colorTextMuted ?? '#9ca3af'};
	"
>
	{#if profile}
		<Layout {profile} {links} {tourDates} {pressKitAvailable} />
	{:else}
		<!-- Empty State -->
		<main class="flex min-h-screen items-center justify-center px-4" style="background-color: var(--color-bg)">
			<div class="text-center">
				<img src="/assets/logo.svg" alt="Artistack" class="mx-auto mb-8 h-10" />
				<h1 class="mb-3 text-2xl font-bold" style="color: var(--color-text)">Welcome</h1>
				<p class="mb-8" style="color: var(--color-text-muted)">This site hasn't been set up yet.</p>
				<a
					href="/login"
					class="inline-block rounded-lg px-6 py-3 font-medium transition-opacity hover:opacity-80"
					style="background-color: var(--color-accent); color: white"
				>
					Get Started
				</a>
			</div>
		</main>
	{/if}
</div>
