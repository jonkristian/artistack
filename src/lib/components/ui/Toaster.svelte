<script lang="ts">
  import { getToasts, dismissToast } from '$lib/stores/toast.svelte';

  const toasts = $derived(getToasts());
</script>

{#if toasts.length > 0}
  <div class="flex flex-col gap-1.5 px-3 pb-3">
    {#each toasts as t (t.id)}
      <div
        class="animate-in flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs
					{t.type === 'success' ? 'bg-green-950/60 text-green-400' : ''}
					{t.type === 'error' ? 'bg-red-950/60 text-red-400' : ''}
					{t.type === 'info' ? 'bg-gray-800/60 text-gray-400' : ''}"
      >
        {#if t.type === 'success'}
          <svg
            class="mt-0.5 h-3 w-3 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        {:else if t.type === 'error'}
          <svg
            class="mt-0.5 h-3 w-3 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        {:else if t.type === 'info'}
          <svg
            class="mt-0.5 h-3 w-3 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        {/if}
        <span class="flex-1 break-words">{t.message}</span>
        <button
          onclick={() => dismissToast(t.id)}
          aria-label="Dismiss"
          class="shrink-0 opacity-40 transition-opacity hover:opacity-100"
        >
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
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
