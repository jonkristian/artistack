<script lang="ts">
	import type { Block, Link, Media } from '$lib/server/schema';
	import { SortableList } from '$lib/components/ui';
	import { toast } from '$lib/stores/toast.svelte';
	import { getTempId } from '$lib/stores/pageDraft.svelte';

	let {
		block,
		links,
		media,
		oneditlink
	}: {
		block: Block;
		links: Link[];
		media: Media[];
		oneditlink: (link: Link) => void;
	} = $props();

	// Links belonging to this block
	const blockLinks = $derived(
		links
			.filter((l) => l.blockId === block.id)
			.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
	);

	// Add link form state
	let newUrl = $state('');

	function handleAddLink() {
		if (!newUrl.trim()) return;

		// Simple platform detection from URL hostname
		let platform = 'link';
		try {
			const urlObj = new URL(newUrl);
			const hostname = urlObj.hostname.replace('www.', '').toLowerCase();
			if (hostname.includes('spotify')) platform = 'spotify';
			else if (hostname.includes('youtube') || hostname.includes('youtu.be')) platform = 'youtube';
			else if (hostname.includes('bandcamp')) platform = 'bandcamp';
			else if (hostname.includes('soundcloud')) platform = 'soundcloud';
			else if (hostname.includes('instagram')) platform = 'instagram';
			else if (hostname.includes('tiktok')) platform = 'tiktok';
			else if (hostname.includes('twitter') || hostname.includes('x.com')) platform = 'twitter';
			else if (hostname.includes('facebook')) platform = 'facebook';
			else platform = hostname.split('.')[0];
		} catch {
			// Invalid URL, use default
		}

		const newLink: Link = {
			id: getTempId(),
			blockId: block.id,
			category: 'other',
			platform,
			url: newUrl,
			label: null,
			thumbnailUrl: null,
			embedData: null,
			position: blockLinks.length,
			visible: true
		};

		// Add to the links array (mutate in place for reactivity)
		links.push(newLink);
		// Trigger reactivity by reassigning
		links.length = links.length;

		newUrl = '';
		toast.info('Link added');
	}

	function handleDeleteLink(id: number) {
		const index = links.findIndex(l => l.id === id);
		if (index !== -1) {
			links.splice(index, 1);
			links.length = links.length; // trigger reactivity
		}
	}

	function handleReorderLinks(items: Link[]) {
		// Update positions
		items.forEach((item, i) => {
			const link = links.find(l => l.id === item.id);
			if (link) link.position = i;
		});
		links.length = links.length; // trigger reactivity
	}
</script>

<div class="space-y-3">
	<form
		onsubmit={(e) => { e.preventDefault(); handleAddLink(); }}
		class="flex gap-2"
	>
		<input
			type="url"
			bind:value={newUrl}
			placeholder="Paste URL..."
			aria-label="Link URL"
			class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={!newUrl.trim()}
			class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
		>
			Add
		</button>
	</form>

	{#if blockLinks.length > 0}
		<SortableList items={blockLinks} onreorder={handleReorderLinks}>
			{#snippet children(link)}
				<div class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800">
					<div class="flex items-center gap-2 min-w-0">
						<div data-drag-handle class="text-gray-600 hover:text-gray-400">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
							</svg>
						</div>
						{#if link.thumbnailUrl}
							<img src={link.thumbnailUrl} alt="" loading="lazy" class="h-8 w-8 rounded object-cover" />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm text-white truncate">{link.label || link.platform.replace('_', ' ')}</span>
								{#if link.embedData && link.embedData.enabled !== false}
									<span class="text-xs text-violet-400">Player</span>
								{/if}
							</div>
							<span class="text-xs text-gray-500 capitalize">{link.platform.replace('_', ' ')}</span>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							onclick={() => oneditlink(link)}
							class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-white group-hover:opacity-100"
							aria-label="Edit {link.label || link.platform} link"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
						</button>
						<button
							onclick={() => handleDeleteLink(link.id)}
							class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-red-400 group-hover:opacity-100"
							aria-label="Delete {link.label || link.platform} link"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			{/snippet}
		</SortableList>
	{:else}
		<p class="py-2 text-center text-xs text-gray-600">No links yet</p>
	{/if}
</div>
