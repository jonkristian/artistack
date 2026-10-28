<script lang="ts">
  import { dangerButtonClass } from '$lib/utils/classes';
  /**
   * The shell every block's settings are shown in.
   *
   * A heading, whatever the block has to say for itself, and the one thing
   * every one of them can do: come off the timeline.
   *
   * Two shapes, one set of controls. Inline it is the selection panel beside
   * the strip, which is where a block's settings belong and where every editor
   * puts them — a thing's properties, following what you have selected. As a
   * modal it is the same content with a backdrop, for the places that still
   * open one.
   *
   * Shared rather than copied because the shell is the part that has to behave
   * identically: three dialogs that each remembered to close on Escape in their
   * own way would be three dialogs that eventually didn't.
   */
  import type { Snippet } from 'svelte';
  import { dismissable } from '$lib/utils/dialog';

  interface Props {
    /**
     * What this is, when that isn't already obvious.
     *
     * A shot's filename says which shot; "Caption 3" says only that you
     * selected the third one, which you did on purpose a moment ago. Absent,
     * the panel starts with the thing itself.
     */
    title?: string;
    /** The controls for this kind of block, laid out by whoever knows them. */
    children: Snippet;
    /**
     * Anything else about this block, after the controls and before the way to
     * remove it — which belongs last, being the one thing you cannot undo by
     * pressing it again.
     */
    extra?: Snippet;
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
    /**
     * Shown in the panel rather than over the page.
     *
     * No backdrop, no Done — a panel is not something you finish with, it is
     * something that is simply showing what you have selected.
     */
    inline?: boolean;
    onremove: () => void;
    onclose: () => void;
  }

  let {
    title,
    children,
    extra,
    removeLabel = 'Remove',
    wide = false,
    inline = false,
    onremove,
    onclose
  }: Props = $props();

  let dialogEl = $state<HTMLDialogElement>();

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    if (!inline) dialogEl?.showModal();
  });
</script>

{#if inline}
  <section class="space-y-5">
    {#if title}
      <h2 class="text-sm font-medium tracking-wider text-gray-400 uppercase">{title}</h2>
    {/if}

    {@render children()}

    {#if extra}
      <div class="border-t border-gray-800 pt-4">
        {@render extra()}
      </div>
    {/if}

    <div class="border-t border-gray-800 pt-4">
      <button type="button" onclick={onremove} class={dangerButtonClass}>
        {removeLabel}
      </button>
    </div>
  </section>
{:else}
  <dialog
    bind:this={dialogEl}
    use:dismissable
    class="fixed inset-0 m-auto h-fit w-full {wide
      ? 'max-w-2xl'
      : 'max-w-md'} rounded-xl border border-gray-700 bg-gray-900 p-0 text-gray-50 backdrop:bg-black/60"
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
          class="{dangerButtonClass} w-auto"
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
{/if}
