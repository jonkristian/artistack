<script lang="ts">
  import type { Block, BaseBlockConfig } from '$lib/server/schema';
  import { blockRegistry } from '$lib/blocks';
  import type { Snippet } from 'svelte';

  let {
    block,
    ondelete,
    ontogglevisibility,
    ontogglecollapsed,
    children,
    settings
  }: {
    block: Block;
    ondelete: (id: number) => void;
    ontogglevisibility: (id: number, visible: boolean) => void;
    ontogglecollapsed?: (id: number, collapsed: boolean) => void;
    children: Snippet;
    settings?: Snippet;
  } = $props();

  let expanded = $derived(!block.collapsed);
  let settingsOpen = $state(false);

  const def = $derived(blockRegistry[block.type]);

  const config = $derived((block.config as BaseBlockConfig) ?? {});
  const marginTop = $derived(config.marginTop ?? 'none');
  const marginBottom = $derived(config.marginBottom ?? 'medium');

  const spacingOptions = ['none', 'small', 'medium', 'large'] as const;

  function setMarginTop(value: BaseBlockConfig['marginTop']) {
    block.config = { ...block.config, marginTop: value };
  }

  function setMarginBottom(value: BaseBlockConfig['marginBottom']) {
    block.config = { ...block.config, marginBottom: value };
  }

  function toggleExpanded() {
    ontogglecollapsed?.(block.id, !block.collapsed);
  }
</script>

<div
  class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 {block.visible === false
    ? 'opacity-50'
    : ''}"
>
  <!-- Header -->
  <div class="flex items-center gap-2 px-4 py-3">
    <!-- Drag handle -->
    <div data-drag-handle class="text-gray-600 hover:text-gray-400">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
      </svg>
    </div>

    <!-- Icon -->
    {#if def}
      <svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={def.icon} />
      </svg>
    {/if}

    <!-- Label -->
    <span class="flex-1 text-sm font-medium text-gray-300">
      {block.label || def?.defaultLabel || block.type}
    </span>

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <!-- Settings cog -->
        <button
          onclick={() => (settingsOpen = !settingsOpen)}
          class="rounded p-1 transition-colors hover:bg-gray-800 {settingsOpen
            ? 'text-violet-400'
            : 'text-gray-600 hover:text-gray-400'}"
          title="Block settings"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

      <!-- Visibility toggle -->
      <button
        onclick={() => ontogglevisibility(block.id, !block.visible)}
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-400"
        title={block.visible ? 'Hide block' : 'Show block'}
      >
        {#if block.visible !== false}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
            />
          </svg>
        {/if}
      </button>

      <!-- Expand/Collapse -->
      <button
        onclick={toggleExpanded}
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-400"
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <svg
          class="h-4 w-4 transition-transform {expanded ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <!-- Delete -->
      <button
        onclick={() => ondelete(block.id)}
        class="rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-red-400"
        title="Delete block"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  </div>

  <!-- Settings panel -->
  {#if settingsOpen}
    <div class="border-t border-gray-800 bg-gray-800/30 px-4 py-4 space-y-4">
      {#if settings}
        {@render settings()}
      {/if}

      <!-- Spacing (common to all blocks) -->
      <div class="space-y-3">
        <span class="block text-xs font-medium uppercase tracking-wider text-gray-500">Spacing</span>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <span class="mb-1.5 block text-sm text-gray-400">Top</span>
            <div class="flex gap-1">
              {#each spacingOptions as opt}
                <button
                  type="button"
                  onclick={() => setMarginTop(opt)}
                  class="flex-1 rounded px-1.5 py-1 text-xs font-medium capitalize transition-colors {marginTop === opt
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
                >
                  {opt === 'none' ? '0' : opt[0].toUpperCase()}
                </button>
              {/each}
            </div>
          </div>
          <div>
            <span class="mb-1.5 block text-sm text-gray-400">Bottom</span>
            <div class="flex gap-1">
              {#each spacingOptions as opt}
                <button
                  type="button"
                  onclick={() => setMarginBottom(opt)}
                  class="flex-1 rounded px-1.5 py-1 text-xs font-medium capitalize transition-colors {marginBottom === opt
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
                >
                  {opt === 'none' ? '0' : opt[0].toUpperCase()}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Content -->
  {#if expanded}
    <div class="border-t border-gray-800 px-4 py-4">
      {@render children()}
    </div>
  {/if}
</div>
