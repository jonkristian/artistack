<script lang="ts">
  /**
   * The three ways a file gets into something, as one control.
   *
   * It replaced two full-width buttons stacked above the list they filled —
   * a violet slab and a grey one, each as tall as a form field, for an action
   * taken once at the start and then not again. They were the loudest thing in
   * the panel and the first thing you stopped needing.
   *
   * The ways in are genuinely three, so they are three: off this machine, out
   * of the library, or off a phone. Drag and drop is the fourth and is the
   * whole surface rather than a button, which is how a drop target should read.
   */
  import { Icon, ArrowUpTray, RectangleStack, DevicePhoneMobile } from 'svelte-hero-icons';
  import { addToLibrary } from '$lib/utils/upload';
  import { toast } from '$lib/stores/toast.svelte';

  let {
    accept,
    onadd,
    onbrowse,
    onphone,
    hint = 'or drop files here'
  }: {
    /** What the file dialog offers, and nothing about what a drop may carry. */
    accept?: string;
    /** The library rows that just arrived, in the order they were uploaded. */
    onadd: (ids: number[]) => void;
    /** Opens whatever picker the caller owns. */
    onbrowse: () => void;
    /** Shows the QR. Absent where there is nothing for a phone to upload into. */
    onphone?: () => void;
    hint?: string;
  } = $props();

  let field = $state<HTMLInputElement>();
  let over = $state(false);
  let busy = $state(false);
  /** 0–1 through the batch, counting whole files plus the one in flight. */
  let through = $state(0);

  /**
   * Uploads a batch, one at a time.
   *
   * Sequentially, like the picker: these are takes off a camera, and three of
   * them in parallel is three slow uploads instead of one quick one followed
   * by another. Whatever got through is handed over even if a later one fails,
   * because the ones that worked are in the library either way.
   */
  async function take(files: File[]) {
    if (!files.length || busy) return;
    busy = true;
    through = 0;
    const landed: number[] = [];
    try {
      for (const [index, file] of files.entries()) {
        try {
          const added = await addToLibrary(file, (f) => (through = (index + f) / files.length));
          landed.push(added.id);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}`);
        }
      }
    } finally {
      busy = false;
      through = 0;
    }
    if (landed.length) onadd(landed);
  }
</script>

<div
  role="group"
  aria-label="Add media"
  ondragover={(e) => {
    e.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    e.preventDefault();
    over = false;
    take(Array.from(e.dataTransfer?.files ?? []));
  }}
  class="rounded-lg border border-dashed p-4 transition-colors {over
    ? 'border-violet-500 bg-violet-500/10'
    : 'border-gray-700 bg-gray-900/40'}"
>
  <!-- Upload across the top, the other two under it.

       Three across a rail this narrow left each of them about seven
       characters, so the main one read "Uplo…". It is also the one people
       want nine times in ten: full width says which it is without a word of
       explanation, and the two that are occasionally what you meant share the
       line below. -->
  {#snippet way(label: string, icon: typeof ArrowUpTray, act: () => void, lead = false)}
    <button
      type="button"
      onclick={act}
      disabled={busy}
      title={label}
      class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 {lead
        ? 'bg-violet-600 text-white hover:bg-violet-500'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-50'}"
    >
      <Icon src={icon} size="16" class="shrink-0" />
      <span class="truncate">{label}</span>
    </button>
  {/snippet}

  <div class="flex flex-col gap-2">
    <div class="flex">
      {@render way('Upload', ArrowUpTray, () => field?.click(), true)}
    </div>
    <div class="flex items-center gap-2">
      {@render way('Library', RectangleStack, onbrowse)}
      {#if onphone}
        {@render way('Phone', DevicePhoneMobile, onphone)}
      {/if}
    </div>
  </div>

  <!-- The hint doubles as the progress line: while something is uploading the
       thing worth saying is how far along it is, and it is the same row. -->
  {#if busy}
    <div class="mt-2 px-0.5">
      <div class="h-1 overflow-hidden rounded-full bg-gray-800">
        <div
          class="h-full rounded-full bg-violet-500 transition-[width] duration-200"
          style="width: {Math.round(through * 100)}%"
        ></div>
      </div>
    </div>
  {:else}
    <p class="mt-3 text-center text-xs text-gray-500">{hint}</p>
  {/if}

  <input
    bind:this={field}
    type="file"
    multiple
    {accept}
    class="hidden"
    onchange={(e) => {
      const chosen = Array.from(e.currentTarget.files ?? []);
      e.currentTarget.value = '';
      take(chosen);
    }}
  />
</div>
