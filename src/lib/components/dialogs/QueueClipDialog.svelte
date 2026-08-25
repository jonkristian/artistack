<script lang="ts">
  /**
   * The one question worth asking about a finished clip: when does it go out?
   *
   * All three answers live here — take the next slot, go on a date you pick, or
   * go right now. They used to be scattered: a queue button, a field further
   * down the card to fill in afterwards, and a separate Publish now beside them.
   * Same decision, three places to make it.
   */
  import { untrack } from 'svelte';
  import { DateTimePicker } from '$lib/components/ui';

  interface Props {
    /** Where the next drip slot falls, so "next available" isn't an abstraction. */
    nextSlot: Date | null;
    /** The clip's existing pin, when this is opened to change one. */
    scheduledFor?: string;
    /** Already queued, so this is a change of mind rather than a first choice. */
    queued?: boolean;
    locale?: string;
    /** False when no publish webhook is set, so "now" can't do anything. */
    publishConfigured?: boolean;
    onchoose: (mode: Mode, when: string | null) => void;
    onclose: () => void;
  }

  type Mode = 'drip' | 'date' | 'now';

  let {
    nextSlot,
    scheduledFor = '',
    queued = false,
    locale = 'nb-NO',
    publishConfigured = true,
    onchoose,
    onclose
  }: Props = $props();

  // Read once: the parent mounts this per open, so there is no later value to
  // react to, and an effect would fight the user's own edits.
  const initial = untrack(() => scheduledFor);

  let mode = $state<Mode>(initial ? 'date' : 'drip');
  let when = $state(initial);

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });

  const slotLabel = $derived(
    nextSlot
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'full',
          timeStyle: 'short',
          hour12: false
        }).format(nextSlot)
      : 'whenever publishing is switched on'
  );

  const ready = $derived(mode === 'date' ? when !== '' : mode === 'drip' || publishConfigured);

  function confirm() {
    if (!ready) return;
    onchoose(mode, mode === 'date' ? when : null);
    dialogEl?.close();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  {onclose}
>
  <div class="p-6">
    <h2 class="mb-1 text-lg font-semibold">
      {queued ? 'Change release' : 'Release this clip'}
    </h2>
    <p class="mb-5 text-sm text-gray-500">When should this go out?</p>

    <div class="space-y-2">
      <label
        class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors {mode ===
        'drip'
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-gray-700 hover:bg-gray-800/50'}"
      >
        <input type="radio" bind:group={mode} value="drip" class="mt-1 accent-violet-500" />
        <span>
          <span class="block text-sm font-medium text-white">Next available slot</span>
          <span class="block text-xs text-gray-400">{slotLabel}</span>
        </span>
      </label>

      <label
        class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors {mode ===
        'date'
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-gray-700 hover:bg-gray-800/50'}"
      >
        <input type="radio" bind:group={mode} value="date" class="mt-1 accent-violet-500" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-white">On a specific date</span>
          <span class="block text-xs text-gray-400">
            Goes out then regardless of the usual cadence.
          </span>
        </span>
      </label>

      {#if mode === 'date'}
        <!-- Below the choice rather than inside it: a calendar nested in a label
             steals the click that would select the option. Flush with the two
             options above, so the three read as one stack. -->
        <DateTimePicker value={when} {locale} onchange={(v) => (when = v)} />
      {/if}

      <label
        class="flex items-start gap-3 rounded-lg border p-3 whitespace-nowrap transition-colors {publishConfigured
          ? 'cursor-pointer'
          : 'cursor-not-allowed opacity-40'} {mode === 'now'
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-gray-700 hover:bg-gray-800/50'}"
      >
        <input
          type="radio"
          bind:group={mode}
          value="now"
          disabled={!publishConfigured}
          class="mt-1 accent-violet-500"
        />
        <span>
          <span class="block text-sm font-medium text-white">Publish now</span>
          <span class="block text-xs text-gray-400">
            {publishConfigured
              ? 'Skips the queue and fires the publish webhook straight away.'
              : 'Set a publish webhook in Integrations first.'}
          </span>
        </span>
      </label>
    </div>

    <div class="mt-6 flex justify-end gap-2">
      <button
        onclick={() => dialogEl?.close()}
        class="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white"
      >
        Cancel
      </button>
      <button
        onclick={confirm}
        disabled={!ready}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {mode === 'now' ? 'Publish now' : queued ? 'Save' : 'Add to queue'}
      </button>
    </div>
  </div>
</dialog>
