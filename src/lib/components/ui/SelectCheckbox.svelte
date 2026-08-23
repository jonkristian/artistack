<script lang="ts">
  /**
   * The corner select box on a grid tile.
   *
   * Always visible rather than revealed on hover: if selecting is hidden until
   * you happen to point at something, nobody discovers they can select at all.
   *
   * The click event is handed back untouched because the tiles differ — the
   * media tile is a click-to-open div and only needs stopPropagation, while a
   * clip tile is a link and also needs preventDefault.
   */
  let {
    checked,
    onclick
  }: {
    checked: boolean;
    onclick: (event: MouseEvent) => void;
  } = $props();
</script>

<button
  type="button"
  {onclick}
  aria-label={checked ? 'Deselect' : 'Select'}
  class="absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {checked
    ? 'border-violet-500 bg-violet-500'
    : 'border-white/60 bg-black/40 hover:border-white'}"
>
  {#if checked}
    <svg class="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
    </svg>
  {/if}
</button>
