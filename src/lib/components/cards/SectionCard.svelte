<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    actions,
    children
  }: {
    title?: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
  {#if title || actions}
    <div class="mb-4 flex items-center justify-between">
      {#if title}
        <h2 class="text-sm font-medium tracking-wider text-gray-400 uppercase">{title}</h2>
      {:else}
        <div></div>
      {/if}
      {#if actions}
        {@render actions()}
      {/if}
    </div>
  {/if}
  {@render children()}
</section>
