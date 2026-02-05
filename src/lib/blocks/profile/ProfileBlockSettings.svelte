<script lang="ts">
	import type { Block, ProfileBlockConfig } from '$lib/server/schema';

	let { block }: { block: Block } = $props();

	// Get config with defaults
	const config = $derived((block.config as ProfileBlockConfig) ?? {});

	function toggle(key: keyof ProfileBlockConfig) {
		block.config = { ...config, [key]: !config[key] };
	}
</script>

<div class="space-y-2">
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Name</span>
		<input type="checkbox" checked={config.showName !== false} onchange={() => toggle('showName')} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Logo</span>
		<input type="checkbox" checked={config.showLogo !== false} onchange={() => toggle('showLogo')} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Photo</span>
		<input type="checkbox" checked={config.showPhoto !== false} onchange={() => toggle('showPhoto')} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Bio</span>
		<input type="checkbox" checked={config.showBio !== false} onchange={() => toggle('showBio')} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
	<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5">
		<span class="text-sm text-white">Show Email as text</span>
		<input type="checkbox" checked={config.showEmail === true} onchange={() => toggle('showEmail')} class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900" />
	</label>
</div>
