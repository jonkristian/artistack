<script lang="ts">
  /**
   * A select whose options carry a thumbnail.
   *
   * A native <select> can't render images, and these options are near-identical
   * filenames distinguished only by colour — so the swatch is the part that
   * actually identifies them. Options without an image (a "default" or "random"
   * entry) fall back to their label.
   */
  export interface ImageOption {
    value: string;
    label: string;
    image?: string | null;
    /** Shown under the label — a hint about what the option does. */
    hint?: string;
  }

  let {
    value,
    options,
    onchange,
    placeholder = 'Select'
  }: {
    value: string;
    options: ImageOption[];
    onchange: (value: string) => void;
    placeholder?: string;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  const selected = $derived(options.find((o) => o.value === value) ?? null);

  function pick(next: string) {
    open = false;
    if (next !== value) onchange(next);
  }
</script>

<svelte:window
  onclick={(e) => {
    // The trigger lives inside root, so its own click can't close the panel.
    if (open && root && !root.contains(e.target as Node)) open = false;
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') open = false;
  }}
/>

<div bind:this={root} class="relative">
  <button
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class="flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-left text-sm text-white transition-colors hover:border-gray-600 focus:border-violet-500 focus:outline-none"
  >
    {#if selected?.image}
      <img
        src={selected.image}
        alt=""
        class="h-6 w-8 shrink-0 rounded bg-gray-950 object-contain"
      />
    {/if}
    <span class="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
    <svg
      class="h-4 w-4 shrink-0 text-gray-500 transition-transform {open ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <ul
      role="listbox"
      class="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
    >
      {#each options as option (option.value)}
        <li>
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            onclick={() => pick(option.value)}
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors {option.value ===
            value
              ? 'bg-violet-600/20 text-violet-200'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white'}"
          >
            {#if option.image}
              <img
                src={option.image}
                alt=""
                loading="lazy"
                class="h-7 w-9 shrink-0 rounded bg-gray-950 object-contain"
              />
            {:else}
              <span class="h-7 w-9 shrink-0"></span>
            {/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate">{option.label}</span>
              {#if option.hint}
                <span class="block truncate text-[10px] text-gray-500">{option.hint}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
