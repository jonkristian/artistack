<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { slugify, validateSlug, SLUG_ERROR_MESSAGES } from '$lib/utils/slug';

  interface Props {
    /** The current address. The parent mounts this component only when open. */
    slug: string;
    /** What the address would be if derived from the title. */
    title: string;
    onsave: (slug: string) => void;
    onclose: () => void;
  }

  let { slug, title, onsave, onclose }: Props = $props();

  /*
   * Read once in the script body rather than an $effect: an effect reading this
   * would be invalidated by handleSave() writing it and reopen the dialog a
   * microtask after close. The parent remounts per open, so there is no later
   * value to react to.
   */
  const initial = untrack(() => slug);

  let value = $state(initial);

  const fromTitle = $derived(slugify(title));
  const matchesTitle = $derived(value === fromTitle);
  const error = $derived(validateSlug(value));
  const changed = $derived(value !== initial);

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });

  function handleSave() {
    if (error) return;
    onsave(value);
    dialogEl?.close();
  }
</script>

<dialog
  bind:this={dialogEl}
  {onclose}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
>
  <div class="p-5">
    <h2 class="text-sm font-medium tracking-wider text-gray-400 uppercase">Page address</h2>

    <div class="mt-4">
      <label class={labelClass} for="slug-value">Address</label>
      <div class="flex items-center gap-2">
        <span class="shrink-0 font-mono text-sm text-gray-500">/</span>
        <input
          id="slug-value"
          class={fieldClass}
          bind:value
          oninput={(e) => (value = slugify(e.currentTarget.value))}
        />
      </div>
      {#if error}
        <p class="mt-1 text-xs text-red-400">{SLUG_ERROR_MESSAGES[error]}</p>
      {/if}
    </div>

    {#if !matchesTitle && fromTitle}
      <!-- Divergence is worth naming but not worth fixing automatically: the
           address is what people have already shared, and the title is only
           what it's called. -->
      <div class="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-sm">
        <p class="font-medium text-amber-300">This no longer matches the title</p>
        <p class="mt-1 text-amber-200/70">
          The title would give <span class="font-mono">/{fromTitle}</span>. That's fine to leave —
          the address only has to stay stable, not stay in step.
        </p>
        <button
          type="button"
          class="mt-2 rounded-lg border border-amber-700/60 px-2.5 py-1 text-xs text-amber-200 transition hover:bg-amber-900/40"
          onclick={() => (value = fromTitle)}
        >
          Use /{fromTitle}
        </button>
      </div>
    {/if}

    {#if changed}
      <div class="mt-4 rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm">
        <p class="font-medium text-gray-300">Changing this breaks links already shared</p>
        <p class="mt-1 text-gray-500">
          Anyone who saved or posted the old address gets a dead page, and chat apps that cached a
          preview of it keep showing the old one. Safe before you've shared it; costly after.
        </p>
      </div>
    {/if}

    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onclick={() => dialogEl?.close()}
        class="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-white"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={handleSave}
        disabled={Boolean(error) || !changed}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  </div>
</dialog>
