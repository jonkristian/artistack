<script lang="ts">
	import type { Block, ImagesBlockConfig } from '$lib/server/schema';

	let { block }: { block: Block } = $props();

	const config = $derived((block.config as ImagesBlockConfig) ?? {});
	const displayAs = $derived(config.displayAs ?? 'grid');

	function setDisplayAs(mode: 'grid' | 'carousel' | 'download') {
		block.config = { ...config, displayAs: mode };
	}

	function updateHeading(e: FocusEvent) {
		const value = (e.target as HTMLInputElement).value;
		if (value === (config.heading ?? '')) return;
		block.config = { ...config, heading: value || undefined };
	}
</script>

<div class="space-y-4">
	<div>
		<label for="images-heading-{block.id}" class="mb-1 block text-sm text-gray-400">Section Heading</label>
		<input
			id="images-heading-{block.id}"
			type="text"
			value={config.heading ?? ''}
			onblur={updateHeading}
			placeholder="e.g., Press Kit, Gallery"
			class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		/>
	</div>

	<div>
		<span class="mb-2 block text-sm text-gray-400">Display as</span>
		<div class="flex gap-2">
			{#each [{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carousel' }, { value: 'download', label: 'Download' }] as option}
				<button
					onclick={() => setDisplayAs(option.value as 'grid' | 'carousel' | 'download')}
					class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors {displayAs === option.value
						? 'bg-violet-600 text-white'
						: 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>
</div>
