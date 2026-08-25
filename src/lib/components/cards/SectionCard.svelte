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

<section
  class="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-[clamp(0.875rem,3vw,1.25rem)]"
>
  {#if title || actions}
    <div class="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
