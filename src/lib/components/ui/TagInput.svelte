<script lang="ts">
  import { untrack } from 'svelte';

  /**
   * Tags, as a combobox over the shared vocabulary.
   *
   * Suggestions are the point: the vocabulary only stays consistent if picking
   * an existing tag is easier than retyping it. A chip field had that backwards
   * — it opened on an empty box, which asks you to remember, and only offered
   * the list once you had typed something for it to match against. Here the
   * list is what opens, and typing narrows it.
   *
   * Free text is still allowed. Anything matching nothing can be added from the
   * search line, and the server matches by slug, so a near-miss in casing
   * attaches the existing tag rather than making a second one.
   *
   * The trigger is one line whatever it holds — a well-tagged clip can't push
   * the form around any more, which is what a wrapping chip field did every
   * time you added the fourth one.
   */
  let {
    initial = [],
    suggestions = [],
    placeholder = 'Add a tag…',
    onchange
  }: {
    /** Tag names to start from. Read once — key the component to reseed it. */
    initial?: string[];
    /** Every known tag name, for the list. */
    suggestions?: string[];
    placeholder?: string;
    onchange: (names: string[]) => void;
  } = $props();

  // Owned here and handed back through onchange, rather than a bindable prop
  // the component mutates. Reseeding is the parent's job via {#key}.
  let value = $state<string[]>([...untrack(() => initial)]);
  let query = $state('');
  let open = $state(false);

  let rootEl = $state<HTMLElement>();
  let searchEl = $state<HTMLInputElement>();

  const taken = $derived(new Set(value.map((t) => t.toLowerCase())));

  /**
   * Everything offerable, chosen first.
   *
   * Chosen first because taking a tag off is the other half of the job, and
   * sorting purely alphabetically would scatter the four you want to review
   * among forty you don't.
   */
  const options = $derived.by(() => {
    const seen = new Set<string>();
    const pool: string[] = [];
    for (const name of [...value, ...suggestions]) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(name);
    }

    const needle = query.trim().toLowerCase();
    const shown = needle ? pool.filter((n) => n.toLowerCase().includes(needle)) : pool;

    return shown.sort((a, b) => {
      const chosen = Number(taken.has(b.toLowerCase())) - Number(taken.has(a.toLowerCase()));
      return chosen || a.localeCompare(b);
    });
  });

  /** Typed something the vocabulary hasn't got, so it can be made. */
  const creatable = $derived.by(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    return options.some((n) => n.toLowerCase() === trimmed.toLowerCase()) ? null : trimmed;
  });

  function toggle(name: string) {
    value = taken.has(name.toLowerCase())
      ? value.filter((t) => t.toLowerCase() !== name.toLowerCase())
      : [...value, name];
    onchange(value);
  }

  function create() {
    if (!creatable) return;
    value = [...value, creatable];
    query = '';
    onchange(value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Whatever the list is pointing at: the new tag if this is one, otherwise
      // the best match. Enter is never a no-op with text in the box.
      if (creatable) create();
      else if (options.length) toggle(options[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
    }
  }

  // Opening puts the cursor in the search line: the list is the point, but
  // narrowing it is what you do next. Closing forgets what was typed.
  $effect(() => {
    if (open) searchEl?.focus();
    else query = '';
  });

  /*
   * Close on anything outside. `pointerdown` rather than `click`, so it lands
   * before whatever was pressed reacts, and captured, so a handler that stops
   * propagation can't leave this stuck open.
   */
  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) open = false;
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });
</script>

<div class="relative" bind:this={rootEl}>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-haspopup="listbox"
    class="flex w-full items-center gap-2 rounded-lg border bg-gray-800 px-3 py-2 text-left text-sm
           transition-colors hover:border-gray-600 {open ? 'border-gray-600' : 'border-gray-700'}"
  >
    {#if value.length}
      <!-- Chips, because that's what they are — a comma-separated line reads as
           one value with commas in it rather than four separate things.

           Plain spans: this trigger is a button, and a button inside a button
           is not markup. Taking one off happens in the list below, which is
           also where you can see what you're choosing from.

           Clipped rather than wrapped, with the last one fading out so the cut
           looks deliberate. The count beside it says how many didn't fit. The
           fade lands on empty space when they all do, so it costs nothing. -->
      <span
        class="flex min-w-0 flex-1 gap-1 overflow-hidden
               [mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]"
      >
        {#each value as tag (tag)}
          <span
            class="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-xs whitespace-nowrap text-gray-200"
          >
            {tag}
          </span>
        {/each}
      </span>
    {:else}
      <span class="min-w-0 flex-1 truncate text-gray-500">{placeholder}</span>
    {/if}
    {#if value.length}
      <span class="shrink-0 text-xs text-gray-500 tabular-nums">{value.length}</span>
    {/if}
    <svg
      class="h-4 w-4 shrink-0 text-gray-500 transition-transform {open ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
    >
      <div class="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
        <svg
          class="h-3.5 w-3.5 shrink-0 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          bind:this={searchEl}
          bind:value={query}
          onkeydown={handleKeydown}
          placeholder="Search or add…"
          aria-label="Search or add a tag"
          class="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
        />
      </div>

      <ul role="listbox" aria-multiselectable="true" class="max-h-56 overflow-y-auto py-1">
        {#if creatable}
          <li>
            <button
              type="button"
              onclick={create}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-violet-300 hover:bg-gray-800"
            >
              <svg
                class="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span class="truncate">Add “{creatable}”</span>
            </button>
          </li>
        {/if}

        {#each options as name (name)}
          {@const chosen = taken.has(name.toLowerCase())}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={chosen}
              onclick={() => toggle(name)}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-800
                     {chosen ? 'text-white' : 'text-gray-300'}"
            >
              <!-- The tick's space is held whether or not it's there, so the
                   names line up and the chosen ones read as a column. -->
              <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {#if chosen}
                  <svg
                    class="h-3.5 w-3.5 text-violet-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                {/if}
              </span>
              <span class="truncate">{name}</span>
            </button>
          </li>
        {/each}

        {#if !options.length && !creatable}
          <li class="px-3 py-2 text-sm text-gray-500">
            {suggestions.length ? 'Nothing matches.' : 'No tags yet — type one to add it.'}
          </li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
