<script lang="ts">
  /**
   * The little picture at the head of a row in a block's admin card.
   *
   * One definition rather than one per block. The shows, releases and shop
   * blocks all list things the site owns and the editor only looks at, and a
   * thumbnail that differed in size or corner between them would make one read
   * as a different kind of list than the others.
   *
   * Always draws something. A row that grows a picture only when there happens
   * to be one has a ragged left edge and no longer scans as a list.
   */
  let {
    src = null,
    alt = ''
  }: {
    src?: string | null;
    alt?: string;
  } = $props();
</script>

{#if src}
  <img {src} {alt} loading="lazy" class="h-8 w-8 shrink-0 rounded object-cover" />
{:else}
  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-800">
    <svg class="h-3.5 w-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  </div>
{/if}
