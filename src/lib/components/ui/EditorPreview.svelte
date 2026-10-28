<script lang="ts">
  /**
   * Editor beside a live preview on a wide screen; one at a time, with a toggle,
   * on a narrow one.
   *
   * Stacking them was the other option and it's the more fluid answer, but a
   * preview below the fold stops being a *live* preview — you can't see the
   * effect of the control you're touching. Showing one at a time keeps whichever
   * you chose at full width, which is the whole point of a preview on a phone.
   */
  import { onMount, type Snippet } from 'svelte';
  import { editorPreview } from '$lib/stores/editorPreview.svelte';

  let {
    editor,
    preview,
    aside,
    asideClass = 'lg:w-[24rem] lg:flex-none',
    footer,
    previewStyle = '',
    editorClass = 'lg:w-1/2 lg:flex-none',
    previewClass = 'lg:w-1/2 lg:flex-none',
    padPreview = false,
    padEditor = true,
    editorScroll = true
  }: {
    editor: Snippet;
    preview: Snippet;
    /**
     * A strip under both panes, the full width of whatever this component sits
     * in — which is the page beside the sidebar, without anything here having
     * to know how wide that is.
     *
     * It stays put while the panes scroll, because they are what scrolls: the
     * panes carry the overflow and this is simply the last row of a column
     * that's already the height of the screen. No fixed positioning, and so no
     * offset to keep in step with the layout around it.
     */
    footer?: Snippet;
    /**
     * A column on the far side of the picture.
     *
     * For what belongs to the thing you have selected rather than to the whole
     * page. Its own surface because the alternative is borrowing the editor's
     * — which means remembering what was there, whether it was open, and
     * putting it back, three pieces of state that exist only to hide the
     * borrowing. On the right so the picture sits between the two columns
     * rather than being pushed against the edge by both.
     *
     * A step lighter than the panes either side of it — the same grey the
     * cards in this admin use — so it reads as a surface laid over the page
     * rather than a third pane of it. It comes and goes, and a surface that
     * comes and goes should look like one.
     *
     * Rendered only when the caller passes one, so nothing is reserved for a
     * column that isn't there.
     */
    aside?: Snippet;
    asideClass?: string;
    /** Inline style for the preview pane, for pages that theme its background. */
    previewStyle?: string;
    /** Wide-screen split. The default is even; the clip editor is 3/5 to 2/5. */
    editorClass?: string;
    previewClass?: string;
    /** Live site previews are edge-to-edge; a pane of cards needs the gutter. */
    padPreview?: boolean;
    /**
     * Off when the editor pane holds its own chrome.
     *
     * A column with a rail down its side has to own both: the rail runs the
     * full height and must not be inset, and it must stay put while the panel
     * beside it scrolls — which it can't if the scrolling happens out here.
     */
    padEditor?: boolean;
    editorScroll?: boolean;
  } = $props();

  // The toggle itself renders in the admin top bar; this only says it exists.
  onMount(editorPreview.register);

  const showing = $derived(editorPreview.showing);
</script>

<div class="flex min-h-screen flex-col lg:h-screen">
  <!-- `hidden lg:…` rather than an {#if}: keeping both mounted means the
       preview doesn't rebuild, and the editor doesn't lose scroll position or
       a half-typed field, every time you flip between them.

       The preview comes back as `lg:flex`, not `lg:block`: it is a flex column
       whose last row is sized by what is left over, and `block` quietly won
       over the `flex` in its base class whenever the toggle sat on the editor.
       A pane that is a column on one setting and a block on the other is a
       height chain that breaks for half the people using it. -->
  <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
    <div
      class="bg-panel flex-1 {editorScroll ? 'overflow-y-auto' : 'overflow-hidden'} {padEditor
        ? 'p-[clamp(1rem,4vw,1.5rem)]'
        : ''} {editorClass} {showing === 'editor' ? '' : 'hidden lg:block'}"
    >
      {@render editor()}
    </div>

    <div
      class="bg-stage flex min-h-0 flex-1 flex-col overflow-y-auto border-gray-800 lg:border-l {previewClass} {padPreview
        ? 'bg-stage space-y-6 p-[clamp(1rem,4vw,1.5rem)]'
        : ''} {showing === 'preview' ? '' : 'hidden lg:flex'}"
      style={previewStyle}
    >
      {@render preview()}
    </div>

    {#if aside}
      <div
        class="bg-aside flex min-h-0 flex-col overflow-y-auto border-gray-800 lg:border-l {asideClass} {showing ===
        'editor'
          ? 'hidden lg:flex'
          : ''}"
      >
        {@render aside()}
      </div>
    {/if}
  </div>

  <!-- Unstyled: a footer that draws its own rule and background would leave a
       stray line across the page on every screen whose footer has nothing to
       say. With the chrome inside, an empty one collapses to nothing. -->
  {#if footer}
    <div class="shrink-0">
      {@render footer()}
    </div>
  {/if}
</div>
