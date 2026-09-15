<script lang="ts">
  /**
   * The shell every block's settings open into when its block is too small.
   *
   * A modal, a heading, whatever the block has to say for itself, and the two
   * things every one of them can do: take it off the timeline, or stop looking
   * at it. The strip is still the editor — this is what a strip does when a
   * block is forty pixels wide and its tools would be two hundred.
   *
   * Shared rather than copied because the shell is the part that has to behave
   * identically: three dialogs that each remembered to close on Escape in their
   * own way would be three dialogs that eventually didn't.
   */
  import type { Snippet } from 'svelte';
  import { dismissable } from '$lib/utils/dialog';

  interface Props {
    title: string;
    /** The controls for this kind of block, laid out by whoever knows them. */
    children: Snippet;
    /** What removing it is called, since a bed and a caption go different ways. */
    removeLabel?: string;
    /**
     * Room for a grid rather than a list.
     *
     * Most of these are a short column of switches and `md` is generous for
     * that. The effect picker is a wall of tiles beside a column of dials, and
     * in `md` the two fought: labels truncated to three letters, a dial landed
     * on top of its own label, and the dialog grew a sideways scrollbar.
     */
    wide?: boolean;
    onremove: () => void;
    onclose: () => void;
  }

  let {
    title,
    children,
    removeLabel = 'Remove',
    wide = false,
    onremove,
    onclose
  }: Props = $props();

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });
</script>

<dialog
  bind:this={dialogEl}
  use:dismissable
  class="fixed inset-0 m-auto h-fit w-full {wide
    ? 'max-w-2xl'
    : 'max-w-md'} rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  {onclose}
>
  <div class="space-y-5 p-6">
    <h2 class="text-lg font-semibold">{title}</h2>

    {@render children()}

    <div class="flex items-center justify-between border-t border-gray-800 pt-4">
      <button
        type="button"
        onclick={() => {
          onremove();
          dialogEl?.close();
        }}
        class="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-400 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
      >
        {removeLabel}
      </button>
      <button
        type="button"
        onclick={() => dialogEl?.close()}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
      >
        Done
      </button>
    </div>
  </div>
</dialog>
