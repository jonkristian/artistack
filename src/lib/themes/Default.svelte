<script lang="ts">
	import type { Profile, Link, TourDate } from '$lib/server/schema';
	import { BandcampEmbed, SpotifyEmbed, YouTubeEmbed } from '$lib/components/embeds';
	import { getPlatformInfoFromUrl } from '$lib/utils/platforms';

	let {
		profile,
		links,
		tourDates,
		pressKitAvailable = false
	}: {
		profile: Profile;
		links: Link[];
		tourDates: TourDate[];
		pressKitAvailable?: boolean;
	} = $props();

	// Click tracking - fire and forget, doesn't block navigation
	function trackClick(linkId: number) {
		// Use sendBeacon for reliability (works even if page is closing)
		if (navigator.sendBeacon) {
			navigator.sendBeacon('/api/track', JSON.stringify({ linkId }));
		} else {
			// Fallback to fetch
			fetch('/api/track', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ linkId }),
				keepalive: true
			}).catch(() => {});
		}
	}

	// Share functionality
	let showCopiedToast = $state(false);

	async function share() {
		const shareData = {
			title: profile.name,
			text: profile.bio ? `${profile.name} - ${profile.bio}` : `Check out ${profile.name}!`,
			url: window.location.href
		};

		if (navigator.share && navigator.canShare?.(shareData)) {
			try {
				await navigator.share(shareData);
			} catch (err) {
				// User cancelled or error - ignore
				if ((err as Error).name !== 'AbortError') {
					copyToClipboard();
				}
			}
		} else {
			copyToClipboard();
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(window.location.href);
		showCopiedToast = true;
		setTimeout(() => (showCopiedToast = false), 2000);
	}

	// Add to calendar (ICS file)
	function addToCalendar(tour: TourDate) {
		const eventDate = new Date(tour.date);
		// Format: YYYYMMDDTHHMMSS
		const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

		// Use tour time if available, otherwise assume 8pm
		const startDate = new Date(eventDate);
		if (tour.time) {
			const [hours, minutes] = tour.time.split(':').map(Number);
			startDate.setHours(hours, minutes, 0, 0);
		} else {
			startDate.setHours(20, 0, 0, 0);
		}
		const endDate = new Date(startDate);
		endDate.setHours(startDate.getHours() + 3, startDate.getMinutes(), 0, 0);

		// Build event summary
		const eventTitle = tour.title || `${profile.name} at ${tour.venue.name}`;
		const description = [
			tour.title ? `${profile.name} live at ${tour.venue.name}` : `${profile.name} live`,
			tour.lineup ? `Line-up: ${tour.lineup}` : '',
			tour.ticketUrl ? `Tickets: ${tour.ticketUrl}` : ''
		].filter(Boolean).join('\\n');

		const icsContent = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Artistack//EN',
			'BEGIN:VEVENT',
			`DTSTART:${formatDate(startDate)}`,
			`DTEND:${formatDate(endDate)}`,
			`SUMMARY:${eventTitle}`,
			`LOCATION:${tour.venue.name}, ${tour.venue.city}`,
			`DESCRIPTION:${description}`,
			`URL:${tour.ticketUrl || tour.eventUrl || window.location.href}`,
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');

		const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${profile.name}-${tour.venue.name}.ics`;
		link.click();
		URL.revokeObjectURL(url);
	}

	// Separate links by category
	const socialLinks = $derived(links.filter((l) => l.category === 'social'));
	const streamingLinks = $derived(links.filter((l) => l.category === 'streaming'));
	const otherLinks = $derived(links.filter((l) => l.category !== 'social' && l.category !== 'streaming'));

	// Separate tour dates into upcoming and past
	const today = new Date().toISOString().split('T')[0];
	const upcomingShows = $derived(tourDates.filter((t) => t.date >= today));
	const pastShows = $derived(tourDates.filter((t) => t.date < today).reverse()); // Most recent past first
	let showPastShows = $state(false);

	// Display options - using getters to ensure reactivity
	const showName = $derived(profile.showName !== false);
	const showLogo = $derived(profile.showLogo !== false);
	const showPhoto = $derived(profile.showPhoto !== false);
	const showBio = $derived(profile.showBio !== false);
	const showSocial = $derived(profile.showSocial !== false);
	const showStreaming = $derived(profile.showStreaming !== false);
	const showTourDates = $derived(profile.showTourDates !== false);

	// Locale for date formatting
	const locale = $derived(profile.locale || 'nb-NO');

	// Shape styling helpers
	const photoShape = $derived(profile.photoShape || 'wide-rounded');
	const logoShape = $derived(profile.logoShape || 'circle');

	const shapeClasses: Record<string, string> = {
		circle: 'rounded-full',
		rounded: 'rounded-3xl',
		square: 'rounded-none',
		wide: 'rounded-none',
		'wide-rounded': 'rounded-2xl'
	};

	const isWidePhoto = $derived(photoShape === 'wide' || photoShape === 'wide-rounded');
	const photoShapeClass = $derived(shapeClasses[photoShape] || 'rounded-2xl');
	const logoShapeClass = $derived(shapeClasses[logoShape] || 'rounded-full');

	// Social icons
	const socialIcons: Record<string, string> = {
		instagram: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.757-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
		tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
		twitter: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
		facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
		youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
		email: 'M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z'
	};

	// Platform icons for links
	const platformIcons: Record<string, string> = {
		spotify: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
		apple_music: 'M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.003-.083-.01-.124-.013H5.988c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.62.497 2.373.518 1.14 1.39 1.94 2.547 2.443.477.207.98.327 1.494.39.65.077 1.303.098 1.956.098H18.49c.193 0 .387-.015.58-.024.63-.03 1.26-.097 1.864-.283 1.27-.39 2.244-1.13 2.913-2.26.332-.56.53-1.17.635-1.81.094-.57.137-1.143.147-1.72.002-.045.01-.09.01-.135V6.125h-.003z',
		youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z',
		youtube_music: 'M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104z',
		soundcloud: 'M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1',
		bandcamp: 'M0 18.75l7.437-13.5H24l-7.438 13.5H0z'
	};

	const platformColors: Record<string, string> = {
		spotify: '#1DB954',
		apple_music: '#FA243C',
		youtube: '#FF0000',
		youtube_music: '#FF0000',
		soundcloud: '#FF5500',
		bandcamp: '#629aa9'
	};
</script>

<main class="flex min-h-screen items-start justify-center px-0 pb-0 pt-0 sm:px-8 sm:pb-0 sm:pt-16" style="background-color: var(--color-bg)">
	<!-- Card wrapper with gradient border -->
	<div class="relative min-h-screen w-full max-w-2xl sm:min-h-[calc(100vh-4rem)]">
		<!-- Gradient border (hidden on mobile) -->
		<div class="pointer-events-none absolute -inset-px hidden rounded-t-3xl sm:block" style="background: linear-gradient(160deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05) 40%, transparent 70%)"></div>
		<!-- Card content -->
		<div class="relative min-h-screen w-full overflow-visible rounded-t-3xl px-2 pb-8 pt-16 sm:min-h-[calc(100vh-4rem)] sm:px-6 sm:shadow-xl" style="background-color: var(--color-card)">
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

	<!-- Main image + Name layout -->
	<div class="relative mb-8 mt-4">
		<!-- Photo takes priority, otherwise logo -->
		{#if showPhoto && profile.photoUrl}
			<div class="relative mx-auto {isWidePhoto ? 'w-full max-w-md' : 'h-44 w-44 sm:h-52 sm:w-52'}">
				<!-- Glow effect (outside clipped container) -->
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

		<!-- Title below image -->
		{#if showName}
			<h1
				class="mt-4 text-2xl font-bold tracking-tight sm:text-3xl"
				style="color: var(--color-text)"
			>
				{profile.name}
			</h1>
		{/if}

		<!-- Bio below name -->
		{#if showBio && profile.bio}
			<p class="mx-auto max-w-md text-base leading-relaxed px-2 {showName ? 'mt-3' : 'mt-6'}" style="color: var(--color-text-muted)">{profile.bio}</p>
		{/if}
	</div>

	<!-- Social Icons -->
	{#if showSocial && (socialLinks.length > 0 || profile.email)}
		<div class="flex justify-center gap-3">
			{#each socialLinks as link (link.id)}
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					onclick={() => trackClick(link.id)}
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
			{#if profile.email}
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

<!-- Streaming Links -->
{#if showStreaming && streamingLinks.length > 0}
	<section class="mb-8 space-y-3">
		{#each streamingLinks as link (link.id)}
			{#if link.embedData?.platform === 'bandcamp' && link.embedData?.id && link.embedData?.enabled !== false}
				<!-- Bandcamp Embedded Player -->
				<BandcampEmbed
					embedId={link.embedData.id}
					embedType={link.embedData.type || 'album'}
					title={link.label || 'Bandcamp'}
					bgColor={link.embedData.bgColor || profile.colorCard || '333333'}
					linkColor={link.embedData.linkColor || profile.colorAccent || '8b5cf6'}
					size={link.embedData.size || 'large'}
					tracklist={link.embedData.tracklist !== false}
					artwork={link.embedData.artwork || 'small'}
				/>
			{:else if link.embedData?.platform === 'spotify' && link.embedData?.id && link.embedData?.enabled !== false}
				<!-- Spotify Embedded Player -->
				<SpotifyEmbed
					embedId={link.embedData.id}
					embedType={link.embedData.type || 'track'}
					theme={link.embedData.theme || 'dark'}
					compact={link.embedData.compact || false}
				/>
			{:else if link.embedData?.platform === 'youtube' && link.embedData?.id && link.embedData?.enabled !== false}
				<!-- YouTube Embedded Player -->
				<YouTubeEmbed videoId={link.embedData.id} />
			{:else}
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					onclick={() => trackClick(link.id)}
					class="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-white/5 p-2 transition-all hover:bg-white/10 active:scale-[0.98]"
				>
					{#if link.thumbnailUrl}
						<img
							src={link.thumbnailUrl}
							alt={link.label || link.platform}
							loading="lazy"
							class="h-16 w-16 flex-shrink-0 rounded-xl object-cover shadow-lg"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate font-semibold" style="color: var(--color-text)">{link.label || link.platform.replace('_', ' ')}</p>
							<p class="mt-0.5 flex items-center gap-1.5 text-sm" style="color: var(--color-text-muted)">
								{#if platformIcons[link.platform]}
									<svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: {platformColors[link.platform] || 'currentColor'}">
										<path d={platformIcons[link.platform]} />
									</svg>
								{/if}
								<span class="capitalize">{link.platform.replace('_', ' ')}</span>
							</p>
						</div>
					{:else}
						{#if platformIcons[link.platform]}
							<div
								class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
								style="background: linear-gradient(135deg, {platformColors[link.platform] || 'var(--color-accent)'}40, {platformColors[link.platform] || 'var(--color-accent)'}20)"
							>
								<svg viewBox="0 0 24 24" class="h-6 w-6" style="fill: {platformColors[link.platform] || 'var(--color-accent)'}">
									<path d={platformIcons[link.platform]} />
								</svg>
							</div>
						{:else}
							<div
								class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold"
								style="background: linear-gradient(135deg, var(--color-accent), var(--color-accent)80); color: white"
							>
								{link.platform.charAt(0).toUpperCase()}
							</div>
						{/if}
						<span class="flex-1 font-semibold capitalize" style="color: var(--color-text)">
							{link.label || link.platform.replace('_', ' ')}
						</span>
					{/if}
					<svg class="h-5 w-5 flex-shrink-0 transition-all group-hover:translate-x-1" style="color: var(--color-text-muted); opacity: 0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</a>
			{/if}
		{/each}
	</section>
{/if}

<!-- Other Links -->
{#if otherLinks.length > 0}
	<section class="mb-8 space-y-3">
		{#each otherLinks as link (link.id)}
			<a
				href={link.url}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => trackClick(link.id)}
				class="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-white/5 p-2 transition-all hover:bg-white/10 active:scale-[0.98]"
			>
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl font-bold"
					style="background: linear-gradient(135deg, var(--color-accent), var(--color-accent)80); color: var(--color-text)"
				>
					{link.platform.charAt(0).toUpperCase()}
				</div>
				<span class="flex-1 font-semibold capitalize" style="color: var(--color-text)">
					{link.label || link.platform.replace('_', ' ')}
				</span>
				<svg class="h-5 w-5 flex-shrink-0 transition-all group-hover:translate-x-1" style="color: var(--color-text-muted); opacity: 0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		{/each}
	</section>
{/if}

<!-- Tour Dates -->
{#if showTourDates && (upcomingShows.length > 0 || pastShows.length > 0)}
	<section class="mb-5">
		{#if upcomingShows.length > 0}
			<h2 class="mb-3 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--color-accent)">Upcoming Shows</h2>
		{/if}
		<div class="space-y-2">
			{#each upcomingShows as tour (tour.id)}
				{@const eventInfo = tour.eventUrl ? getPlatformInfoFromUrl(tour.eventUrl) : null}
				{@const mapsUrl = tour.venue.placeId
					? `https://www.google.com/maps/place/?q=place_id:${tour.venue.placeId}`
					: tour.venue.lat && tour.venue.lng
						? `https://www.google.com/maps?q=${tour.venue.lat},${tour.venue.lng}`
						: tour.venue.address
							? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.venue.address)}`
							: null}
				<div
					class="group flex gap-5 rounded-2xl bg-white/5 p-4 transition-all {tour.soldOut ? 'opacity-60' : 'hover:bg-white/10'}"
				>
					<!-- Date column -->
					<div class="w-fit flex-shrink-0 self-center text-center">
						<p class="text-2xl font-bold leading-none" style="color: var(--color-accent)">
							{new Date(tour.date).getDate()}
						</p>
						<p class="mt-1 text-xs font-semibold uppercase tracking-wider" style="color: var(--color-text-muted)">
							{new Date(tour.date).toLocaleDateString(locale, { month: 'short' })}
						</p>
						{#if tour.time}
							<p class="mt-1 text-[10px] font-medium" style="color: var(--color-text-muted)">
								{tour.time}
							</p>
						{/if}
					</div>

					<!-- Content column: Title, then Venue -->
					<div class="min-w-0 flex-1">
						{#if tour.title}
							<p class="truncate font-semibold" style="color: var(--color-text)">{tour.title}</p>
						{/if}
						<p class="truncate text-sm" style="color: var(--color-text-muted)">
							{#if mapsUrl}
								<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 hover:underline" title="Open in Google Maps">
									{tour.venue.name} · {tour.venue.city}
									<svg class="h-3 w-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
								</a>
							{:else}
								{tour.venue.name} · {tour.venue.city}
							{/if}
						</p>
						{#if tour.lineup}
							<p class="mt-0.5 truncate text-xs" style="color: var(--color-text-muted); opacity: 0.75">{tour.lineup}</p>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex flex-shrink-0 items-center gap-2">
						{#if tour.soldOut}
							<span class="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-400">
								Sold Out
							</span>
						{:else if tour.ticketUrl}
							<a
								href={tour.ticketUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all hover:opacity-90 active:scale-95 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5"
								style="background: var(--color-accent); color: var(--color-text)"
								title="Buy tickets"
							>
								<svg class="h-4 w-4 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
								</svg>
								<span class="hidden text-xs font-bold uppercase tracking-wide sm:inline">Tickets</span>
							</a>
						{/if}

						{#if !tour.soldOut}
							<button
								onclick={() => addToCalendar(tour)}
								class="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95 sm:flex"
								style="color: var(--color-text-muted)"
								title="Add to calendar"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
							</button>
						{/if}

						{#if tour.eventUrl}
							<a
								href={tour.eventUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95 sm:flex"
								style="color: var(--color-text)"
								title="View on {eventInfo?.platform || 'event page'}"
							>
								{#if eventInfo?.icon}
									<svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
										<path d={eventInfo.icon} />
									</svg>
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
									</svg>
								{/if}
							</a>
						{/if}

						<!-- Mobile menu -->
						{#if !tour.soldOut || tour.eventUrl}
							<div class="relative sm:hidden">
								<button
									onclick={(e) => {
										const menu = e.currentTarget.nextElementSibling;
										const isHidden = menu?.classList.contains('hidden');
										document.querySelectorAll('[data-tour-menu]').forEach(m => m.classList.add('hidden'));
										if (isHidden) {
											menu?.classList.remove('hidden');
											const closeMenu = (evt: Event) => {
												if (!e.currentTarget?.closest('.relative')?.contains(evt.target as Node)) {
													menu?.classList.add('hidden');
													document.removeEventListener('click', closeMenu);
												}
											};
											setTimeout(() => document.addEventListener('click', closeMenu), 0);
										}
									}}
									class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20 active:scale-95"
									style="color: var(--color-text-muted)"
									title="More options"
								>
									<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
										<circle cx="12" cy="5" r="2" />
										<circle cx="12" cy="12" r="2" />
										<circle cx="12" cy="19" r="2" />
									</svg>
								</button>
								<div data-tour-menu class="absolute right-0 top-full z-10 mt-1 hidden min-w-[160px] rounded-xl p-1 shadow-xl" style="background: var(--color-card); border: 1px solid rgba(255,255,255,0.1)">
									{#if !tour.soldOut}
										<button
											onclick={(e) => {
												addToCalendar(tour);
												e.currentTarget.closest('[data-tour-menu]')?.classList.add('hidden');
											}}
											class="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
											style="color: var(--color-text)"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
											Add to calendar
										</button>
									{/if}
									{#if tour.eventUrl}
										<a
											href={tour.eventUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
											style="color: var(--color-text)"
										>
											{#if eventInfo?.icon}
												<svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
													<path d={eventInfo.icon} />
												</svg>
											{:else}
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
												</svg>
											{/if}
											View on {eventInfo?.platform || 'event page'}
										</a>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Past Shows (collapsible) -->
		{#if pastShows.length > 0}
			<button
				onclick={() => (showPastShows = !showPastShows)}
				class="mt-6 mb-3 flex cursor-pointer items-center gap-2 text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80"
				style="color: var(--color-text-muted)"
			>
				<span>Past Shows</span>
				<svg
					class="h-3 w-3 transition-transform {showPastShows ? 'rotate-180' : ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if showPastShows}
				<div class="mt-3 space-y-2">
					{#each pastShows as tour (tour.id)}
						{@const eventInfo = tour.eventUrl ? getPlatformInfoFromUrl(tour.eventUrl) : null}
						{@const mapsUrl = tour.venue.placeId
							? `https://www.google.com/maps/place/?q=place_id:${tour.venue.placeId}`
							: tour.venue.lat && tour.venue.lng
								? `https://www.google.com/maps?q=${tour.venue.lat},${tour.venue.lng}`
								: tour.venue.address
									? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.venue.address)}`
									: null}
						<div class="group flex gap-5 rounded-2xl bg-white/5 p-4 opacity-60">
							<!-- Date column -->
							<div class="w-fit flex-shrink-0 self-center text-center">
								<p class="text-2xl font-bold leading-none" style="color: var(--color-text-muted)">
									{new Date(tour.date).getDate()}
								</p>
								<p class="mt-1 text-xs font-semibold uppercase tracking-wider" style="color: var(--color-text-muted)">
									{new Date(tour.date).toLocaleDateString(locale, { month: 'short' })}
								</p>
							</div>

							<!-- Content column -->
							<div class="min-w-0 flex-1">
								{#if tour.title}
									<p class="truncate font-semibold" style="color: var(--color-text)">{tour.title}</p>
								{/if}
								<p class="truncate text-sm" style="color: var(--color-text-muted)">
									{#if mapsUrl}
										<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="hover:underline">
											{tour.venue.name} · {tour.venue.city}
										</a>
									{:else}
										{tour.venue.name} · {tour.venue.city}
									{/if}
								</p>
							</div>

							<!-- Event link for past shows -->
							{#if tour.eventUrl}
								<div class="flex flex-shrink-0 items-center">
									<a
										href={tour.eventUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-all hover:bg-white/20"
										style="color: var(--color-text-muted)"
										title="View on {eventInfo?.platform || 'event page'}"
									>
										{#if eventInfo?.icon}
											<svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: currentColor">
												<path d={eventInfo.icon} />
											</svg>
										{:else}
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
											</svg>
										{/if}
									</a>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
{/if}

<!-- Share Section -->
<section class="mt-8 flex justify-center">
	<button
		onclick={share}
		class="flex cursor-pointer items-center gap-2 rounded-full bg-white/5 px-5 py-2.5 text-sm font-medium transition-all hover:bg-white/10 active:scale-95"
		style="color: var(--color-text-muted)"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
		</svg>
		Share
	</button>
</section>

{#if pressKitAvailable}
	<!-- Press Kit link - subtle, for press/promoters -->
	<section class="mt-12 flex justify-center">
		<a
			href="/uploads/press-kit.zip"
			download
			class="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
			style="color: var(--color-text-muted); opacity: 0.5"
		>
			<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
			</svg>
			Press Kit
		</a>
	</section>
{/if}
	</div>
	</div>

<!-- Copied Toast -->
{#if showCopiedToast}
	<div
		class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
		style="animation: fadeInUp 0.2s ease-out"
	>
		Link copied to clipboard
	</div>
{/if}
</main>

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