<script lang="ts">
  /**
   * What the autosave is doing, for an editor with no Save button.
   *
   * Renders nothing at all when there's nothing to say, and floats over the
   * page rather than sitting in it. In the flow it cost a row of the column
   * permanently — pushing the first card out of line with the preview beside
   * it — to reserve space against a layout shift it can no longer cause: out
   * of the flow, appearing and leaving moves nothing.
   *
   * "Saved" shows briefly and goes. It's the answer to "did that stick?", asked
   * in the second after a change and never again; a permanent one is a light
   * that's always green and so tells you nothing.
   *
   * Positioning belongs to the caller, which knows what this is floating over.
   */
  import type { Autosave } from '$lib/utils/autosave.svelte';

  let { autosave }: { autosave: Autosave } = $props();

  let showSaved = $state(false);

  $effect(() => {
    if (!autosave.savedAt) return;
    showSaved = true;
    const timer = setTimeout(() => (showSaved = false), 2000);
    return () => clearTimeout(timer);
  });
</script>

{#if autosave.failure || autosave.saving || showSaved}
  <!-- A chip, because it's over the page now rather than part of it, and needs
       its own edge to be readable against whatever it lands on. -->
  <div
    class="flex min-w-0 items-center gap-2 rounded-full bg-gray-900 px-2.5 py-1 text-xs shadow-lg ring-1 ring-gray-800"
  >
    {#if autosave.failure}
      <svg
        class="h-3.5 w-3.5 shrink-0 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <span class="min-w-0 truncate text-red-300">Couldn't save {autosave.failure.what}</span>
      <button
        onclick={() => autosave.retry()}
        disabled={autosave.saving}
        class="shrink-0 rounded-md border border-red-800/60 px-2 py-0.5 font-medium text-red-200
               transition-colors hover:bg-red-900/40 disabled:opacity-50"
      >
        Try again
      </button>
      <button
        onclick={() => autosave.dismiss()}
        aria-label="Dismiss"
        title="Dismiss"
        class="shrink-0 px-1 text-red-400/70 transition-colors hover:text-red-300"
      >
        ✕
      </button>
    {:else if autosave.saving}
      <svg class="h-3.5 w-3.5 shrink-0 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span class="text-gray-500">Saving…</span>
    {:else if showSaved}
      <svg
        class="h-3.5 w-3.5 shrink-0 text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span class="text-gray-600">Saved</span>
    {/if}
  </div>
{/if}
