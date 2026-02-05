<script lang="ts">
	import type { Block, TourDatesBlockConfig } from '$lib/server/schema';

	let { block }: { block: Block } = $props();

	const config = $derived((block.config as TourDatesBlockConfig) ?? {});

	function updateHeading(e: FocusEvent) {
		const value = (e.target as HTMLInputElement).value;
		if (value === (config.heading ?? '')) return;
		block.config = { ...config, heading: value || undefined };
	}

	function toggleShowPastShows(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		block.config = { ...config, showPastShows: checked };
	}
</script>

<div class="space-y-3">
	<div>
		<label for="tour-heading-{block.id}" class="mb-1 block text-sm text-gray-400">Section Heading</label>
		<input
			id="tour-heading-{block.id}"
			type="text"
			value={config.heading ?? ''}
			onblur={updateHeading}
			placeholder="e.g., Upcoming Shows, Tour"
			class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
		/>
	</div>
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Past Shows</span>
		<input type="checkbox" checked={config.showPastShows !== false} onchange={toggleShowPastShows} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
</div>
