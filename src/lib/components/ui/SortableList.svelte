<script lang="ts" generics="T extends { id: number }">
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Snippet } from 'svelte';

	let {
		items = $bindable([]),
		onreorder,
		children
	}: {
		items: T[];
		onreorder?: (items: T[]) => void;
		children: Snippet<[T]>;
	} = $props();

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<{ items: T[] }>) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: T[] }>) {
		items = e.detail.items;
		onreorder?.(items);
	}
</script>

<div
	use:dndzone={{ items, flipDurationMs, dropTargetStyle: {} }}
	onconsider={handleDndConsider}
	onfinalize={handleDndFinalize}
	class="space-y-1.5"
>
	{#each items as item (item.id)}
		<div animate:flip={{ duration: flipDurationMs }}>
			{@render children(item)}
		</div>
	{/each}
</div>
