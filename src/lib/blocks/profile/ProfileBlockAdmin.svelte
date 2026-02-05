<script lang="ts">
	import type { Block, Profile, Link, Media } from '$lib/server/schema';
	import { MediaPicker } from '$lib/components/ui';
	import { getTempId } from '$lib/stores/pageDraft.svelte';
	import { socialIcons } from '$lib/blocks/utils';

	let {
		block,
		profile,
		links,
		media
	}: {
		block: Block;
		profile: Profile;
		links: Link[];
		media: Media[];
	} = $props();

	// Social links (shown as icons in profile header)
	const socialLinks = $derived(
		links.filter((l) => l.category === 'social').sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	);

	// Social platforms we support
	const socialPlatforms = ['instagram', 'tiktok', 'twitter', 'facebook', 'youtube'] as const;

	let newSocialUrl = $state('');

	function detectSocialPlatform(url: string): string | null {
		try {
			const hostname = new URL(url).hostname.replace('www.', '').toLowerCase();
			if (hostname.includes('instagram')) return 'instagram';
			if (hostname.includes('tiktok')) return 'tiktok';
			if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
			if (hostname.includes('facebook') || hostname.includes('fb.com')) return 'facebook';
			if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube';
		} catch {}
		return null;
	}

	function handleAddSocial() {
		if (!newSocialUrl.trim()) return;
		const platform = detectSocialPlatform(newSocialUrl);
		if (!platform) {
			alert('Please enter a valid social media URL (Instagram, TikTok, Twitter/X, Facebook, or YouTube)');
			return;
		}

		const newLink: Link = {
			id: getTempId(),
			blockId: block.id,
			category: 'social',
			platform,
			url: newSocialUrl,
			label: null,
			thumbnailUrl: null,
			embedData: null,
			position: socialLinks.length,
			visible: true
		};

		links.push(newLink);
		links.length = links.length;
		newSocialUrl = '';
	}

	function handleDeleteSocial(id: number) {
		const index = links.findIndex((l) => l.id === id);
		if (index !== -1) {
			links.splice(index, 1);
			links.length = links.length;
		}
	}
</script>

<div class="space-y-4">
	<div>
		<label for="profile-name-{block.id}" class="mb-1 block text-sm text-gray-400">Artist Name</label>
		<input
			id="profile-name-{block.id}"
			type="text"
			bind:value={profile.name}
			placeholder="Your artist or band name"
			class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		/>
	</div>
	<div>
		<label for="profile-bio-{block.id}" class="mb-1 block text-sm text-gray-400">Bio</label>
		<textarea
			id="profile-bio-{block.id}"
			bind:value={profile.bio}
			placeholder="A short bio or tagline"
			rows={3}
			class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		></textarea>
	</div>
	<div>
		<label for="profile-email-{block.id}" class="mb-1 block text-sm text-gray-400">Email</label>
		<input
			id="profile-email-{block.id}"
			type="email"
			bind:value={profile.email}
			placeholder="contact@example.com"
			class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		/>
	</div>

	<!-- Social Links -->
	<div class="border-t border-gray-800 pt-4">
		<label class="mb-2 block text-sm text-gray-400">Social Links</label>

		<!-- Existing social links -->
		{#if socialLinks.length > 0}
			<div class="mb-3 flex flex-wrap gap-2">
				{#each socialLinks as link (link.id)}
					<div class="group relative flex items-center gap-1.5 rounded-lg bg-gray-800 px-2.5 py-1.5">
						{#if socialIcons[link.platform]}
							<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current text-gray-400">
								<path d={socialIcons[link.platform]} />
							</svg>
						{/if}
						<span class="text-xs text-gray-300 capitalize">{link.platform}</span>
						<button
							onclick={() => handleDeleteSocial(link.id)}
							class="ml-1 text-gray-600 hover:text-red-400"
							aria-label="Remove {link.platform}"
						>
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Add new social link -->
		<form onsubmit={(e) => { e.preventDefault(); handleAddSocial(); }} class="flex gap-2">
			<input
				type="url"
				bind:value={newSocialUrl}
				placeholder="Paste social media URL..."
				class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={!newSocialUrl.trim()}
				class="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50"
			>
				Add
			</button>
		</form>
		<p class="mt-1 text-xs text-gray-600">Instagram, TikTok, Twitter/X, Facebook, YouTube</p>
	</div>

	<!-- Images -->
	<div class="grid grid-cols-2 gap-3 border-t border-gray-800 pt-4">
		<MediaPicker
			value={profile.logoUrl ?? null}
			label="Logo"
			{media}
			aspectRatio="1/1"
			shapes={['circle', 'rounded', 'square']}
			defaultShape={(profile.logoShape as 'circle' | 'rounded' | 'square') ?? 'circle'}
			onselect={(url, shape) => {
				profile.logoUrl = url;
				if (shape) profile.logoShape = shape;
			}}
		/>
		<MediaPicker
			value={profile.photoUrl ?? null}
			label="Band Photo"
			{media}
			aspectRatio="1/1"
			shapes={['circle', 'rounded', 'square', 'wide', 'wide-rounded']}
			defaultShape={(profile.photoShape as 'circle' | 'rounded' | 'square' | 'wide' | 'wide-rounded') ?? 'wide-rounded'}
			onselect={(url, shape) => {
				profile.photoUrl = url;
				if (shape) profile.photoShape = shape;
			}}
		/>
	</div>
</div>
