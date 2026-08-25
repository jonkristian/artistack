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
    previewStyle = '',
    editorClass = 'lg:w-1/2 lg:flex-none',
    previewClass = 'lg:w-1/2 lg:flex-none',
    padPreview = false
  }: {
    editor: Snippet;
    preview: Snippet;
    /** Inline style for the preview pane, for pages that theme its background. */
    previewStyle?: string;
    /** Wide-screen split. The default is even; the clip editor is 3/5 to 2/5. */
    editorClass?: string;
    previewClass?: string;
    /** Live site previews are edge-to-edge; a pane of cards needs the gutter. */
    padPreview?: boolean;
  } = $props();

  // The toggle itself renders in the admin top bar; this only says it exists.
  onMount(editorPreview.register);

  const showing = $derived(editorPreview.showing);
</script>

<div class="flex min-h-screen flex-col lg:h-screen">
  <!-- `hidden lg:block` rather than an {#if}: keeping both mounted means the
       preview doesn't rebuild, and the editor doesn't lose scroll position or
       a half-typed field, every time you flip between them. -->
  <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
    <div
      class="flex-1 overflow-y-auto bg-gray-950 p-[clamp(1rem,4vw,1.5rem)] {editorClass} {showing ===
      'editor'
        ? ''
        : 'hidden lg:block'}"
    >
      {@render editor()}
    </div>

    <div
      class="flex-1 overflow-y-auto border-gray-800 lg:border-l {previewClass} {padPreview
        ? 'space-y-6 bg-gray-950 p-[clamp(1rem,4vw,1.5rem)]'
        : ''} {showing === 'preview' ? '' : 'hidden lg:block'}"
      style={previewStyle}
    >
      {@render preview()}
    </div>
  </div>
</div>
