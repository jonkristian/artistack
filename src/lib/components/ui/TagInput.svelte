<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass } from '$lib/utils/classes';

  /**
   * Chips plus autocomplete over the shared tag vocabulary.
   *
   * Suggestions are the point: the vocabulary only stays consistent if picking
   * an existing tag is easier than retyping it. Free text is still allowed —
   * Enter commits whatever is typed, and the server matches it by slug, so a
   * near-miss in casing attaches the existing tag rather than making a new one.
   */
  let {
    initial = [],
    suggestions = [],
    placeholder = 'Add a tag…',
    onchange
  }: {
    /** Tag names to start from. Read once — key the component to reseed it. */
    initial?: string[];
    /** Every known tag name, for autocomplete. */
    suggestions?: string[];
    placeholder?: string;
    onchange: (names: string[]) => void;
  } = $props();

  // Owned here and handed back through onchange, rather than a bindable prop the
  // component mutates. Reseeding is the parent's job via {#key}.
  let value = $state<string[]>([...untrack(() => initial)]);
  let draft = $state('');
  let focused = $state(false);
  let inputEl: HTMLInputElement;

  const taken = $derived(new Set(value.map((t) => t.toLowerCase())));

  const matches = $derived(
    draft.trim()
      ? suggestions
          .filter(
            (s) =>
              s.toLowerCase().includes(draft.trim().toLowerCase()) && !taken.has(s.toLowerCase())
          )
          .slice(0, 6)
      : suggestions.filter((s) => !taken.has(s.toLowerCase())).slice(0, 6)
  );

  function commit(name: string) {
    const trimmed = name.trim();
    if (!trimmed || taken.has(trimmed.toLowerCase())) {
      draft = '';
      return;
    }
    value = [...value, trimmed];
    draft = '';
    onchange(value);
  }

  function remove(index: number) {
    value = value.filter((_, i) => i !== index);
    onchange(value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(matches.length === 1 && draft.trim() ? matches[0] : draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      // Backspace on an empty field removes the last chip, the way every other
      // token field behaves.
      remove(value.length - 1);
    } else if (e.key === 'Escape') {
      focused = false;
    }
  }
</script>

<div class="relative">
  <div
    class="{fieldClass} flex flex-wrap items-center gap-1.5"
    role="presentation"
    onclick={() => inputEl?.focus()}
  >
    {#each value as tag, index (tag)}
      <span
        class="flex items-center gap-1 rounded bg-gray-700 py-0.5 pr-1 pl-2 text-xs text-gray-200"
      >
        {tag}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            remove(index);
          }}
          aria-label="Remove {tag}"
          class="text-gray-400 hover:text-red-400">✕</button
        >
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={draft}
      onkeydown={handleKeydown}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 120)}
      {placeholder}
      class="min-w-24 flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
    />
  </div>

  {#if focused && matches.length}
    <ul
      class="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
    >
      {#each matches as match (match)}
        <li>
          <button
            type="button"
            onclick={() => {
              commit(match);
              inputEl?.focus();
            }}
            class="block w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            {match}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
