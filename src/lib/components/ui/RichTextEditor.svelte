<script lang="ts">
  /**
   * The one place text is written.
   *
   * It was three places: this, for a release's notes; a textarea with an emoji
   * picker bolted beside it, for a clip's description; and an input on a
   * caption block. All the same act — typing something a person will read —
   * and each with its own idea of where the emoji button goes.
   *
   * So the parts that differ are props rather than copies. Marks can be turned
   * off for text that is posted as plain text, where a `<b>` would be typed
   * out rather than read as bold. A meter can be asked for where the length
   * matters. Anything else that belongs in the toolbar — "Save as default", a
   * size control — comes in as a snippet, because what those *do* is the
   * caller's business and where they sit is this one's.
   */
  import { onMount, untrack, type Snippet } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import EmojiPicker from './EmojiPicker.svelte';
  import LengthMeter from './LengthMeter.svelte';
  import { FontSize } from './FontSize';
  import SizeSelect from './SizeSelect.svelte';

  let {
    content = '',
    onUpdate,
    placeholder = '',
    marks = true,
    emoji = true,
    actions,
    meter,
    onblur,
    settle = 400,
    sizes,
    newlines = false,
    minHeight = 'min-h-[10rem]'
  }: {
    content?: string;
    /**
     * The text, as it changes.
     *
     * HTML while there are marks to carry; the words alone when there aren't,
     * because a field whose value is posted verbatim has no use for a `<p>`
     * wrapped round it.
     */
    onUpdate?: (value: string) => void;
    placeholder?: string;
    /** Bold, italic and strikethrough. Off for text that is posted as it is. */
    marks?: boolean;
    /**
     * A line break is a newline, not a paragraph.
     *
     * For values stored as a line of markup rather than as a document — a
     * caption, where the only break this system has ever had is `\n` and the
     * renderer turns it into libass's own. A release's notes are a document
     * and keep their paragraphs.
     */
    newlines?: boolean;
    emoji?: boolean;
    /** More for the toolbar's right: whatever this field can also do. */
    actions?: Snippet;
    /** How much of it will be seen, when that is worth saying. */
    meter?: {
      limit: number;
      hard: number;
      hint?: string;
      softHint?: string;
      hardHint?: string;
      split?: boolean;
    };
    /** Finished for now — the moment a field saves, where a field saves on blur. */
    onblur?: (value: string) => void;
    /**
     * How long typing has to stop before the value is handed over, in ms.
     *
     * A keystroke is not a decision. Reporting every one of them means a write
     * per letter for anything that saves as it goes, and a stream of "saving"
     * that says nothing about whether the sentence is finished. Zero for a
     * caller that wants every change.
     */
    settle?: number;
    /**
     * A size for the selection, in whatever unit the caller stores.
     *
     * Only where a size means something: a caption is drawn by us, at a size
     * measured against the frame, so it can be any number. A description is
     * posted as text and has no size at all.
     */
    sizes?: {
      label: string;
      base: number;
      step?: number;
      /**
       * One size for the whole thing, drawn flat.
       *
       * Two halves of the same idea, for a field in a panel: the size belongs
       * to the caption rather than to three words in it, so choosing one
       * applies to everything without having to select it first — and the
       * field goes on showing the words at its own size, because a caption set
       * to a hundred and eighty pixels would otherwise take the panel apart.
       *
       * The size is still stored, and still drawn at full size where it
       * matters, which is the picture.
       */
      uniform?: boolean;
    };
    /**
     * How much room the field has before it grows.
     *
     * Taller than it was: four rems is two lines, and almost everything
     * written in here — a description, a caption, a release's notes — is more
     * than that. A field that starts smaller than its contents spends its life
     * being scrolled.
     *
     * Only where it starts. The field is draggable from its bottom edge, so
     * this is the height that is right most of the time rather than a decision
     * anybody has to live with.
     */
    minHeight?: string;
  } = $props();

  /**
   * What the caller gets: the markup, or the words, depending.
   *
   * One newline between paragraphs rather than the blank line the editor would
   * leave: a field saving plain text saves what was typed, and `\n\n` for
   * every Enter is twice the gap anybody asked for.
   */
  const words = (e: Editor) => e.getText({ blockSeparator: '\n' });
  const read = (e: Editor) => {
    if (!marks) return words(e);
    const html = e.getHTML();
    if (!newlines) return html;
    // Back to the spelling the caller stores: a break is a newline, and the
    // paragraphs the editor works in are an implementation detail of typing.
    return html
      .replace(/<\/p>\s*<p>/g, '\n')
      .replace(/^\s*<p>/, '')
      .replace(/<\/p>\s*$/, '');
  };

  /**
   * What the editor is given.
   *
   * A newline in the value is a line break, and an editor parsing HTML reads
   * it as whitespace like any other — so every break was lost the first time
   * the field saved. Lines become paragraphs on the way in, and newlines again
   * on the way out. True of both kinds: a caption is markup *with* newlines in
   * it, since the only break this system has ever had is a newline.
   */
  const asDocument = (value: string) => {
    if (marks && !newlines) return value;

    return value
      .split('\n')
      .map((line) =>
        marks
          ? `<p>${line}</p>`
          : `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      )
      .join('');
  };

  /**
   * One shape for everything in the toolbar.
   *
   * It held four sizes — 24×20, 19×20, a 75×22 with a border of its own, and
   * three 28×28 without one — because the glyphs decided the widths and
   * nothing decided the rest. A row of controls that are all the same size
   * reads as a row of controls.
   */
  const control =
    'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs transition-colors';
  const quiet = 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-200';
  const lit = 'bg-gray-600 text-gray-50';

  /** What the meter counts, which is always words rather than markup. */
  let typed = $state('');

  /**
   * The size the control should show.
   *
   * At the caret, ordinarily — that is what the next thing typed will be. But
   * where the size belongs to the whole thing, the caret is beside the point:
   * it sits wherever it was left, which may be past the end of the mark, and
   * the control would say "Normal" about a caption that is plainly not.
   */
  let shownSize = $state<number | null>(null);

  function readSize(e: Editor): number | null {
    if (!sizes?.uniform) return (e.getAttributes('fontSize').size as number | undefined) ?? null;
    const found = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(e.getHTML());
    return found ? Math.round(Number(found[1])) : null;
  }

  let element: HTMLDivElement;
  let settling: ReturnType<typeof setTimeout> | undefined;
  let editor: Editor | undefined = $state();

  /*
   * Follow the content when it changes from outside.
   *
   * TipTap reads `content` once, when it is created, so anything that rewrites
   * the value underneath — an undo, a reload, a default applied elsewhere —
   * left the editor showing what it had. The step was recorded and reversed in
   * the data, and the words on screen did not move.
   *
   * Only while the editor doesn't have focus. Typing is the one case where the
   * value is already arriving *from* here, and setting it back would fight the
   * caret on every keystroke — the caller may normalise what it stores, so
   * what comes back is not always what was sent.
   */
  $effect(() => {
    const incoming = content;
    const e = editor;
    if (!e || e.isFocused) return;
    untrack(() => {
      if (read(e) === incoming) return;
      // `emitUpdate: false`, or putting the value in would be reported as a
      // change and saved straight back out.
      e.commands.setContent(asDocument(incoming), { emitUpdate: false });
    });
  });

  function insertEmoji(emoji: string) {
    editor?.chain().focus().insertContent(emoji).run();
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        FontSize,
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
      content: asDocument(content),
      editorProps: {
        attributes: {
          // `resize-y` needs something other than visible overflow to take
          // hold, which is also what makes the field scroll once it has been
          // dragged shorter than its contents. The grip is the browser's own.
          class: `outline-none ${minHeight} resize-y overflow-auto rounded-b-lg px-3 py-2 text-sm text-gray-50`
        }
      },
      onTransaction: () => {
        editor = editor;
      },
      onUpdate: ({ editor: e }) => {
        // The meter and the size control are this component's own, and cost
        // nothing, so they follow every keystroke.
        typed = words(e);
        shownSize = readSize(e);

        if (!settle) {
          onUpdate?.(read(e));
          return;
        }
        clearTimeout(settling);
        settling = setTimeout(() => onUpdate?.(read(e)), settle);
      },
      onBlur: ({ editor: e }) => {
        // Leaving the field is the end of the sentence, whatever the timer says.
        clearTimeout(settling);
        onUpdate?.(read(e));
        onblur?.(read(e));
      },
      // What is already there counts: a meter that reads zero until the first
      // keystroke is a meter reporting on a field nobody has touched.
      onCreate: ({ editor: e }) => {
        typed = words(e);
        shownSize = readSize(e);
      },
      // The caret moving is reason enough to re-read it, where the size is
      // the caret's business.
      onSelectionUpdate: ({ editor: e }) => {
        shownSize = readSize(e);
      }
    });

    return () => {
      clearTimeout(settling);
      editor?.destroy();
    };
  });
</script>

<div
  class="rich-text-editor bg-field rounded-lg border border-gray-700 focus-within:border-gray-600 {sizes?.uniform
    ? 'flat-sizes'
    : ''}"
  style="--rte-placeholder: '{placeholder}'"
>
  {#if editor}
    <div class="flex items-center gap-1 border-b border-gray-700 px-2 py-1.5">
      {#if marks}
        <button
          type="button"
          onclick={() => editor?.chain().focus().toggleBold().run()}
          class="{control} font-bold {editor.isActive('bold') ? lit : quiet}"
          aria-label="Bold"
          aria-pressed={editor.isActive('bold')}
        >
          B
        </button>
        <button
          type="button"
          onclick={() => editor?.chain().focus().toggleItalic().run()}
          class="{control} italic {editor.isActive('italic') ? lit : quiet}"
          aria-label="Italic"
          aria-pressed={editor.isActive('italic')}
        >
          I
        </button>
        <button
          type="button"
          onclick={() => editor?.chain().focus().toggleStrike().run()}
          class="{control} line-through {editor.isActive('strike') ? lit : quiet}"
          aria-label="Strikethrough"
          aria-pressed={editor.isActive('strike')}
        >
          S
        </button>
      {/if}

      {#if sizes}
        <!-- The sizes worth having, with a dial behind them. A number on its
             own asked everyone to know what 92 meant before they could type
             it, and what it means depends on the frame. -->
        <SizeSelect
          value={shownSize}
          base={sizes.base}
          onchange={(size) => {
            const live = editor;
            const run = live?.chain().focus();
            if (!live || !run) return;
            // Everything, when the size belongs to the whole thing. The
            // selection is put back afterwards so the caret doesn't move.
            const whole = sizes?.uniform ? run.selectAll() : run;
            const set = size === null ? whole.unsetFontSize() : whole.setFontSize(size);
            (sizes?.uniform ? set.setTextSelection(live.state.selection.to) : set).run();
          }}
        />
      {/if}

      <!-- The caller's own, and the emoji, on the right. A toolbar with
           nothing in it is still the field's top edge, so it stays. -->
      <div class="ml-auto flex items-center gap-2">
        {@render actions?.()}
        {#if emoji}
          <EmojiPicker onpick={insertEmoji} />
        {/if}
      </div>
    </div>
  {/if}

  <div bind:this={element}></div>
</div>

{#if meter}
  <LengthMeter
    value={typed}
    limit={meter.limit}
    hard={meter.hard}
    hint={meter.hint ?? ''}
    softHint={meter.softHint ?? ''}
    hardHint={meter.hardHint ?? ''}
    split={meter.split ?? false}
  />
{/if}

<style>
  /* The sizes are stored and rendered; they are simply not *drawn here*, where
     the field is a few hundred pixels wide and the frame is a thousand. */
  .flat-sizes :global(.tiptap [style*='font-size']) {
    /* `!important`, because the size is an inline style and an inline style
       beats a stylesheet however the selector is written. */
    font-size: inherit !important;
  }

  .rich-text-editor :global(.tiptap p.is-editor-empty:first-child::before) {
    content: var(--rte-placeholder);
    float: left;
    color: rgb(107 114 128);
    pointer-events: none;
    height: 0;
  }
</style>
