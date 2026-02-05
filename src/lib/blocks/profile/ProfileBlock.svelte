<script lang="ts">
	import type { Block, Profile, Link, TourDate, Media, ProfileBlockConfig } from '$lib/server/schema';
	import { shareProfile, shapeClasses, socialIcons } from '$lib/blocks/utils';

	let {
		block,
		profile,
		links,
		tourDates,
		media,
		locale
	}: {
		block: Block;
		profile: Profile;
		links: Link[];
		tourDates: TourDate[];
		media: Media[];
		locale: string;
	} = $props();

	const config = $derived((block.config as ProfileBlockConfig) ?? {});
	const showName = $derived(config.showName !== false);
	const showLogo = $derived(config.showLogo !== false);
	const showPhoto = $derived(config.showPhoto !== false);
	const showBio = $derived(config.showBio !== false);
	const showEmail = $derived(config.showEmail === true);

	// Social links for the profile header
	const socialLinks = $derived(links.filter((l) => l.category === 'social'));

	// Shape styling
	const photoShape = $derived(profile.photoShape || 'wide-rounded');
	const logoShape = $derived(profile.logoShape || 'circle');
	const isWidePhoto = $derived(photoShape === 'wide' || photoShape === 'wide-rounded');
	const photoShapeClass = $derived(shapeClasses[photoShape] || 'rounded-2xl');
	const logoShapeClass = $derived(shapeClasses[logoShape] || 'rounded-full');

	// Share
	let showCopiedToast = $state(false);

	function share() {
		shareProfile(profile, () => {
			showCopiedToast = true;
			setTimeout(() => (showCopiedToast = false), 2000);
		});
	}
</script>

<!-- Logo in top right corner (only if we have both photo and logo) -->
{#if showLogo && profile.logoUrl && showPhoto && profile.photoUrl}
	<button
		onclick={share}
		class="absolute top-4 right-4 h-14 w-14 cursor-pointer transition-transform hover:scale-105 active:scale-95"
		title="Share"
	>
		<img
			src={profile.logoUrl}
			alt="{profile.name} logo"
			class="h-full w-full {logoShapeClass} object-cover"
		/>
	</button>
{/if}

<!-- Hero Section -->
<header class="relative mb-10 text-center">
	<div class="relative mb-8 mt-4">
		{#if showPhoto && profile.photoUrl}
			<div class="relative mx-auto {isWidePhoto ? 'w-full max-w-md' : 'h-44 w-44 sm:h-52 sm:w-52'}">
				<div
					class="absolute -inset-4 blur-2xl {!isWidePhoto ? 'rounded-full' : ''}"
					style="background: var(--color-accent); opacity: 0.25"
				></div>
				<button
					onclick={share}
					class="relative block h-full w-full cursor-pointer overflow-hidden {photoShapeClass} transition-transform hover:scale-[1.02] active:scale-[0.98]"
					title="Share"
				>
					<img
						src={profile.photoUrl}
						alt={profile.name}
						class="{isWidePhoto ? 'w-full' : 'h-full w-full'} {photoShapeClass} object-cover shadow-2xl"
						style={isWidePhoto ? 'aspect-ratio: 16/9' : ''}
					/>
				</button>
			</div>
		{:else if showLogo && profile.logoUrl}
			<button
				onclick={share}
				class="relative mx-auto block h-44 w-44 cursor-pointer transition-transform hover:scale-105 active:scale-95 sm:h-52 sm:w-52"
				title="Share"
			>
				<div
					class="absolute -inset-5 {logoShapeClass === 'rounded-full' ? 'rounded-full' : ''} blur-3xl"
					style="background: var(--color-accent); opacity: 0.35"
				></div>
				<img
					src={profile.logoUrl}
					alt="{profile.name} logo"
					class="relative h-full w-full {logoShapeClass} object-cover shadow-2xl"
				/>
			</button>
		{/if}

		{#if showName}
			<h1
				class="mt-4 text-2xl font-bold tracking-tight sm:text-3xl"
				style="color: var(--color-text)"
			>
				{profile.name}
			</h1>
		{/if}

		{#if showBio && profile.bio}
			<p class="mx-auto max-w-md text-base leading-relaxed px-2 {showName ? 'mt-3' : 'mt-6'}" style="color: var(--color-text-muted)">{profile.bio}</p>
		{/if}

		{#if showEmail && profile.email}
			<p class="mt-2 text-sm" style="color: var(--color-text-muted)">
				<a href="mailto:{profile.email}" class="hover:underline">{profile.email}</a>
			</p>
		{/if}
	</div>

	<!-- Social Icons -->
	{#if socialLinks.length > 0 || profile.email}
		<div class="flex justify-center gap-3">
			{#each socialLinks as link (link.id)}
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-9 w-9 items-center justify-center transition-all hover:scale-110"
					style="color: var(--color-text-muted)"
					title={link.label || link.platform}
				>
					{#if socialIcons[link.platform]}
						<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current">
							<path d={socialIcons[link.platform]} />
						</svg>
					{:else}
						<span class="text-sm font-bold">
							{link.platform.charAt(0).toUpperCase()}
						</span>
					{/if}
				</a>
			{/each}
			{#if profile.email && !showEmail}
				<a
					href="mailto:{profile.email}"
					class="flex h-9 w-9 items-center justify-center transition-all hover:scale-110"
					style="color: var(--color-text-muted)"
					title="Email"
				>
					<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current">
						<path d={socialIcons.email} />
					</svg>
				</a>
			{/if}
		</div>
	{/if}
</header>

{#if showCopiedToast}
	<div
		class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
		style="animation: fadeInUp 0.2s ease-out"
	>
		Link copied to clipboard
	</div>
{/if}

<style>
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translate(-50%, 10px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
