<script lang="ts">
	import type { Block, Media, ImagesBlockConfig } from '$lib/server/schema';

	let {
		block,
		media
	}: {
		block: Block;
		media: Media[];
	} = $props();

	const config = $derived((block.config as ImagesBlockConfig) ?? {});
	const selectedIds = $derived(config.mediaIds ?? []);

	function toggleMedia(id: number) {
		const newIds = selectedIds.includes(id)
			? selectedIds.filter((i) => i !== id)
			: [...selectedIds, id];
		block.config = { ...config, mediaIds: newIds };
	}
</script>

<div>
	<div>
		<span class="mb-2 block text-sm text-gray-400">Select images ({selectedIds.length} selected)</span>
		{#if media.length > 0}
			<div class="grid grid-cols-4 gap-2">
				{#each media as item (item.id)}
					<button
						onclick={() => toggleMedia(item.id)}
						class="relative overflow-hidden rounded-lg transition-all {selectedIds.includes(item.id) ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-100'}"
					>
						<img
							src={item.thumbnailUrl || item.url}
							alt={item.alt || item.filename}
							loading="lazy"
							class="aspect-square w-full object-cover"
						/>
						{#if selectedIds.includes(item.id)}
							<div class="absolute inset-0 flex items-center justify-center bg-violet-600/30">
								<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{:else}
			<p class="py-4 text-center text-sm text-gray-600">No media uploaded yet. Upload images in the media library first.</p>
		{/if}
	</div>
</div>
