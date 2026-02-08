<script lang="ts">
  let {
    label,
    description,
    checked = $bindable()
  }: {
    label: string;
    description?: string;
    checked: boolean;
  } = $props();
</script>

<label class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
  <div>
    <span class="text-sm text-white">{label}</span>
    {#if description}
      <p class="text-xs text-gray-500">{description}</p>
    {/if}
  </div>
  <input
    type="checkbox"
    bind:checked
    class="h-5 w-5 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
  />
</label>
