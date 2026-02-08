<script lang="ts">
  import type { Block, LinksBlockConfig } from '$lib/server/schema';

  let { block }: { block: Block } = $props();

  const config = $derived((block.config as LinksBlockConfig) ?? {});

  function updateHeading(e: FocusEvent) {
    const value = (e.target as HTMLInputElement).value;
    if (value === (config.heading ?? '')) return;
    block.config = { ...config, heading: value || undefined };
  }
</script>

<div>
  <label for="links-heading-{block.id}" class="mb-1 block text-sm text-gray-400"
    >Section Heading</label
  >
  <input
    id="links-heading-{block.id}"
    type="text"
    value={config.heading ?? ''}
    onblur={updateHeading}
    placeholder="e.g., Listen, Follow"
    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
  />
</div>
