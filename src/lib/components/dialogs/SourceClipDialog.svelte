<script lang="ts">
  /**
   * Trim and mute for one source clip.
   *
   * These lived inline on the row, which cost two number fields and a switch of
   * horizontal space on every source — and on a phone that was the whole row.
   * They're per-clip adjustments you make once, so they're worth a tap.
   *
   * Applied as you change them, the way the inline controls did and the way the
   * rest of the admin does. A Save button here meant Escape or a click on the
   * backdrop discarded the edit without saying so, which reads as the dialog
   * being broken.
   */
  import { untrack } from 'svelte';
  import { numberClass, labelClass } from '$lib/utils/classes';
  import { ToggleSwitch } from '$lib/components/ui';

  interface Props {
    filename: string;
    duration: string;
    trimStart: number | null;
    trimEnd: number | null;
    muted: boolean;
    onchange: (values: {
      trimStart: number | null;
      trimEnd: number | null;
      muted: boolean;
    }) => void;
    onclose: () => void;
  }

  let { filename, duration, trimStart, trimEnd, muted, onchange, onclose }: Props = $props();

  // Read once: the parent mounts this per open, so there's no later value to
  // react to, and an effect would fight what's being typed.
  const initial = untrack(() => ({ trimStart, trimEnd, muted }));

  let from = $state<number | string | undefined>(initial.trimStart ?? '');
  let to = $state<number | string | undefined>(initial.trimEnd ?? '');
  let isMuted = $state(initial.muted);

  /**
   * A blank field means "no trim", not zero.
   *
   * Takes `unknown` because `bind:value` on a number input hands back a number
   * once something is typed, `undefined` once it's cleared, and the initial
   * string before either — treating it as a string threw on the first save.
   */
  function seconds(raw: unknown) {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  function apply() {
    onchange({ trimStart: seconds(from), trimEnd: seconds(to), muted: isMuted });
  }

  /**
   * Every way out of this dialog saves — Done, Escape, a click on the backdrop —
   * and only on the way out, so there's exactly one write.
   *
   * Saving on blur as well was the first attempt, but closing with a key never
   * blurs the field you were typing in, so the last thing you typed was the
   * thing you lost; and when blur did fire it raced the close.
   */
  function handleClose() {
    apply();
    onclose();
  }

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  onclose={handleClose}
>
  <div class="p-6">
    <h2 class="truncate text-lg font-semibold">{filename}</h2>
    <p class="mb-5 text-sm text-gray-500">{duration}</p>

    <div class="flex gap-3">
      <div class="flex-1">
        <label class={labelClass} for="trim-from">From (seconds)</label>
        <input
          id="trim-from"
          type="number"
          step="0.1"
          min="0"
          bind:value={from}
          class={numberClass + ' w-full'}
        />
      </div>
      <div class="flex-1">
        <label class={labelClass} for="trim-to">To (seconds)</label>
        <input
          id="trim-to"
          type="number"
          step="0.1"
          min="0"
          bind:value={to}
          class={numberClass + ' w-full'}
        />
      </div>
    </div>
    <p class="mt-1 text-xs text-gray-600">Leave empty to use the whole clip.</p>

    <div class="mt-4 border-t border-gray-800 pt-4">
      <ToggleSwitch
        label="Mute this clip"
        size="md"
        checked={isMuted}
        onchange={(v) => (isMuted = v)}
      />
    </div>

    <div class="mt-6 flex justify-end">
      <button
        onclick={() => dialogEl?.close()}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-violet-500"
      >
        Done
      </button>
    </div>
  </div>
</dialog>
