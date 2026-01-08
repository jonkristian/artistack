<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		children
	}: {
		title?: string;
		children: Snippet;
	} = $props();
</script>

<section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
	{#if title}
		<h2 class="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">{title}</h2>
	{/if}
	{@render children()}
</section>
