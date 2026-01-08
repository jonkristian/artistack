<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		ondelete,
		children
	}: {
		ondelete?: () => void;
		children: Snippet;
	} = $props();
</script>

<div class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
	<div class="flex min-w-0 flex-1 items-center gap-2">
		{@render children()}
	</div>
	{#if ondelete}
		<button
			onclick={ondelete}
			aria-label="Delete"
			class="text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	{/if}
</div>
