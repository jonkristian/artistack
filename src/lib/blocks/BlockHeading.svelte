<script lang="ts">
  /**
   * The label above a block's contents.
   *
   * One definition rather than one per block. It was copied into three of them
   * identically and a fourth then invented its own — larger, in the text colour
   * instead of the accent — which is how a page ends up looking like it was
   * built by two people.
   *
   * Renders nothing without a heading, so a block can hand it whatever the
   * config holds and not think about it.
   */
  let { heading }: { heading?: string | null } = $props();
</script>

{#if heading}
  <h2
    class="mb-3 text-[10px] font-semibold tracking-widest uppercase"
    style="color: var(--color-accent)"
  >
    {heading}
  </h2>
{/if}
