<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';

  let {
    content = '',
    onUpdate,
    placeholder = ''
  }: {
    content?: string;
    onUpdate?: (html: string) => void;
    placeholder?: string;
  } = $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          listItem: false
        })
      ],
      content,
      editorProps: {
        attributes: {
          class: 'outline-none min-h-[4rem] px-3 py-2 text-sm text-white'
        }
      },
      onTransaction: () => {
        editor = editor;
      },
      onUpdate: ({ editor: e }) => {
        onUpdate?.(e.getHTML());
      }
    });

    return () => {
      editor?.destroy();
    };
  });
</script>

<div
  class="rich-text-editor rounded-lg border border-gray-700 bg-gray-800 focus-within:border-gray-600"
  style="--rte-placeholder: '{placeholder}'"
>
  {#if editor}
    <div class="flex gap-1 border-b border-gray-700 px-2 py-1.5">
      <button
        type="button"
        onclick={() => editor?.chain().focus().toggleBold().run()}
        class="rounded px-2 py-0.5 text-xs font-bold transition-colors {editor.isActive('bold')
          ? 'bg-gray-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}"
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
      >
        B
      </button>
      <button
        type="button"
        onclick={() => editor?.chain().focus().toggleItalic().run()}
        class="rounded px-2 py-0.5 text-xs italic transition-colors {editor.isActive('italic')
          ? 'bg-gray-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}"
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
      >
        I
      </button>
      <button
        type="button"
        onclick={() => editor?.chain().focus().toggleStrike().run()}
        class="rounded px-2 py-0.5 text-xs line-through transition-colors {editor.isActive('strike')
          ? 'bg-gray-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}"
        aria-label="Strikethrough"
        aria-pressed={editor.isActive('strike')}
      >
        S
      </button>
    </div>
  {/if}

  <div bind:this={element}></div>
</div>

<style>
  .rich-text-editor :global(.tiptap p.is-editor-empty:first-child::before) {
    content: var(--rte-placeholder);
    float: left;
    color: rgb(107 114 128);
    pointer-events: none;
    height: 0;
  }
</style>
