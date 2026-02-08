<script lang="ts">
  import type { Block, ImageBlockConfig } from '$lib/server/schema';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as ImageBlockConfig) ?? {});
  const alignment = $derived(config.alignment ?? 'center');
  const size = $derived(config.size ?? 'medium');
  const showGlow = $derived(config.showGlow ?? false);

  function setAlignment(value: 'left' | 'center' | 'right') {
    block.config = { ...config, alignment: value };
  }

  function setSize(value: 'mini' | 'small' | 'medium' | 'large' | 'full') {
    block.config = { ...config, size: value };
  }

  function toggleGlow() {
    block.config = { ...config, showGlow: !showGlow };
  }
</script>

<div class="space-y-4">
  <!-- Alignment -->
  <div>
    <span class="mb-2 block text-sm text-gray-400">Alignment</span>
    <div class="flex gap-1">
      <button
        type="button"
        onclick={() => setAlignment('left')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {alignment ===
        'left'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        Left
      </button>
      <button
        type="button"
        onclick={() => setAlignment('center')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {alignment ===
        'center'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        Center
      </button>
      <button
        type="button"
        onclick={() => setAlignment('right')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {alignment ===
        'right'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        Right
      </button>
    </div>
  </div>

  <!-- Size -->
  <div>
    <span class="mb-2 block text-sm text-gray-400">Size</span>
    <div class="flex gap-1">
      <button
        type="button"
        onclick={() => setSize('mini')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {size === 'mini'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        XS
      </button>
      <button
        type="button"
        onclick={() => setSize('small')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {size === 'small'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        S
      </button>
      <button
        type="button"
        onclick={() => setSize('medium')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {size === 'medium'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        M
      </button>
      <button
        type="button"
        onclick={() => setSize('large')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {size === 'large'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        L
      </button>
      <button
        type="button"
        onclick={() => setSize('full')}
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors {size === 'full'
          ? 'bg-violet-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
      >
        Full
      </button>
    </div>
  </div>

  <!-- Glow effect -->
  <label
    class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2.5"
  >
    <span class="text-sm text-white">Glow Effect</span>
    <input
      type="checkbox"
      checked={showGlow}
      onchange={toggleGlow}
      class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
    />
  </label>
</div>
