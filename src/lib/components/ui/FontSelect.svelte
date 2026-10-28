<script lang="ts">
  /**
   * Pick a face, shown in itself.
   *
   * A list of font names set in the interface font is a list of words: you
   * cannot tell Anton from Archivo Narrow by reading "Anton" in Inter. Each
   * row is drawn in the face it offers, which is the whole of what a font
   * picker has to do.
   *
   * One component for both places that choose one — the site's own type and
   * the face captions are burned in — because they are choosing from the same
   * list. See `$lib/fonts.ts`.
   */
  import { tick } from 'svelte';
  import { Icon, ChevronDown } from 'svelte-hero-icons';
  import { FONTS, fontById } from '$lib/fonts';
  import { openPopover } from './Popover.svelte';

  let {
    value = null,
    onchange,
    onpeek,
    auto,
    sample = 'Hamburgefonstiv'
  }: {
    /** The chosen id, or null for whatever `auto` describes. */
    value?: string | null;
    onchange: (id: string | null) => void;
    /**
     * The face under the cursor, before anyone has committed to it.
     *
     * A list of names in their own faces tells you what a letterform looks
     * like and not what the page looks like set in it, which is the actual
     * question. So moving through the list shows each one where it will be
     * read — and nothing is written until it is chosen, because arrowing past
     * eight faces is not eight decisions.
     *
     * Called with the real value again when the menu closes unchosen, so
     * looking costs nothing.
     */
    onpeek?: (id: string | null) => void;
    /**
     * What "nothing chosen" means here, when that is an option.
     *
     * The clip editor has one — a caption can defer to the clip — and the site
     * does not: a site is always set in something.
     *
     * A label and nothing else. Each row already shows the face drawn in
     * itself and a line of the caption's own words set in it, which is the
     * question being asked; a sentence under that is a third thing to read
     * before you can see the one thing you came to look at.
     */
    auto?: { label: string };
    /** The words each row is drawn with. */
    sample?: string;
  } = $props();

  const chosen = $derived(fontById(value));

  /** Every row in order, `null` first when there is an automatic choice. */
  const options = $derived<(string | null)[]>([
    ...(auto ? [null] : []),
    ...FONTS.map((font) => font.id)
  ]);

  const token = Symbol('font select');
  let open = $state(false);

  /*
   * The rows, so the arrows can move between them.
   *
   * Focus is moved for real rather than tracked beside it: these are buttons,
   * so Enter and Space already press the focused one, the browser scrolls it
   * into view, and anything reading the screen aloud follows along. A
   * highlight drawn next to the focus is a second idea of which row you are on,
   * and the two drift.
   */
  let rows = $state<HTMLButtonElement[]>([]);

  function focusRow(at: number) {
    const wrapped = (at + options.length) % options.length;
    rows[wrapped]?.focus();
  }

  /** Which row the arrows start from: the one in use, or the first. */
  function focusChosen() {
    const at = options.indexOf(value ?? null);
    focusRow(at < 0 ? 0 : at);
  }

  function onKey(e: KeyboardEvent) {
    const at = rows.findIndex((row) => row === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(at + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(at - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusRow(options.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      // Tabbing away is a way out, like clicking elsewhere.
      setOpen(false);
    }
  }

  function setOpen(next: boolean) {
    open = next;
    if (next) {
      openPopover.claim(token);
      // After the rows exist. Opening and focusing are one gesture as far as
      // anyone pressing a key is concerned.
      tick().then(focusChosen);
    } else {
      openPopover.release(token);
      // Whatever was being looked at goes back to whatever is chosen.
      onpeek?.(value);
      trigger?.focus();
    }
  }

  let trigger = $state<HTMLButtonElement>();

  // Closes when another popover takes the floor, like the wheels and the sizes.
  $effect(() => {
    if (open && !openPopover.holds(token)) setOpen(false);
  });
  $effect(() => () => openPopover.release(token));

  function choose(id: string | null) {
    onchange(id);
    open = false;
    openPopover.release(token);
    trigger?.focus();
  }

  // Nothing left looking at a face it never committed to.
  $effect(() => () => onpeek?.(value));
</script>

<div class="relative">
  <button
    bind:this={trigger}
    type="button"
    onclick={() => setOpen(!open)}
    onkeydown={(e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) setOpen(true);
        else focusChosen();
      }
    }}
    aria-expanded={open}
    aria-haspopup="listbox"
    class="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-left text-sm text-gray-50 transition-colors hover:border-gray-500"
  >
    <span
      class="min-w-0 flex-1 truncate"
      style={chosen ? `font-family: '${chosen.name}', ${chosen.fallback}` : ''}
    >
      {chosen?.name ?? auto?.label ?? 'Choose a font'}
    </span>
    <Icon src={ChevronDown} size="14" solid class="shrink-0 text-gray-500" />
  </button>

  {#if open}
    <!-- Clicking anywhere else puts it away, which is what a menu does. -->
    <button
      type="button"
      class="fixed inset-0 z-20 cursor-default"
      aria-label="Close font menu"
      onclick={() => setOpen(false)}
    ></button>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      role="presentation"
      onkeydown={onKey}
      class="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
    >
      {#if auto}
        <button
          bind:this={rows[0]}
          type="button"
          onfocus={() => onpeek?.(null)}
          onmouseenter={() => onpeek?.(null)}
          onclick={() => choose(null)}
          class="flex w-full flex-col gap-0.5 rounded px-2 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 {value ===
          null
            ? 'bg-violet-600'
            : 'hover:bg-gray-800 focus:bg-gray-800'}"
        >
          <span class="text-sm {value === null ? 'text-white' : 'text-gray-200'}">
            {auto.label}
          </span>
        </button>
        <div class="my-1 border-t border-gray-800"></div>
      {/if}

      {#each FONTS as font, index (font.id)}
        {@const on = font.id === value}
        <button
          bind:this={rows[index + (auto ? 1 : 0)]}
          type="button"
          onfocus={() => onpeek?.(font.id)}
          onmouseenter={() => onpeek?.(font.id)}
          onclick={() => choose(font.id)}
          class="flex w-full flex-col gap-0.5 rounded px-2 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 {on
            ? 'bg-violet-600'
            : 'hover:bg-gray-800 focus:bg-gray-800'}"
        >
          <!-- The name in its own face, and a line of it below: a name alone
               says nothing about a face at a glance, and some of these differ
               only in the letters the name happens not to use. -->
          <span
            class="truncate text-base {on ? 'text-white' : 'text-gray-100'}"
            style="font-family: '{font.name}', {font.fallback}"
          >
            {font.name}
          </span>
          <span
            class="truncate text-sm {on ? 'text-violet-100' : 'text-gray-400'}"
            style="font-family: '{font.name}', {font.fallback}"
          >
            {sample}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
