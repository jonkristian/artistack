<script lang="ts">
	import { getToasts } from '$lib/stores/toast.svelte';

	const toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
	<div class="flex flex-col gap-1.5 px-3 pb-3 overflow-hidden">
		{#each toasts as t (t.id)}
			<div
				class="flex items-center gap-1.5 py-1.5 text-xs animate-in min-w-0
					{t.type === 'success' ? 'text-green-400' : ''}
					{t.type === 'error' ? 'text-red-400' : ''}
					{t.type === 'info' ? 'text-gray-400' : ''}"
			>
				{#if t.type === 'success'}
					<svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				{:else if t.type === 'error'}
					<svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				{:else if t.type === 'info'}
					<svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{/if}
				<span class="truncate min-w-0">{t.message}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-in {
		animation: fade-in 0.15s ease-out;
	}
</style>
