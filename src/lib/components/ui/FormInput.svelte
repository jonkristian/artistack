<script lang="ts">
  let {
    label,
    value = $bindable(),
    placeholder = '',
    type = 'text',
    multiline = false,
    rows = 2
  }: {
    label?: string;
    value: string;
    placeholder?: string;
    type?: 'text' | 'url' | 'date';
    multiline?: boolean;
    rows?: number;
  } = $props();
</script>

{#if label}
  <label class="block">
    <span class="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
    {#if multiline}
      <textarea
        bind:value
        {placeholder}
        {rows}
        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      ></textarea>
    {:else}
      <input
        {type}
        bind:value
        {placeholder}
        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />
    {/if}
  </label>
{:else if multiline}
  <textarea
    bind:value
    {placeholder}
    {rows}
    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
  ></textarea>
{:else}
  <input
    {type}
    bind:value
    {placeholder}
    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
  />
{/if}
