<script lang="ts">
	import { getToasts } from '$lib/stores/toast.svelte';

	const toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
	<div class="flex flex-col gap-2 px-3 pb-3">
		{#each toasts as t (t.id)}
			<div
				class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium animate-in
					{t.type === 'success' ? 'bg-green-500/20 text-green-400' : ''}
					{t.type === 'error' ? 'bg-red-500/20 text-red-400' : ''}
					{t.type === 'info' ? 'bg-gray-700 text-gray-300' : ''}"
			>
				{#if t.type === 'success'}
					<svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				{:else if t.type === 'error'}
					<svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				{/if}
				<span class="truncate">{t.message}</span>
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
