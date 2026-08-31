<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { MediaPicker, DateTimePicker } from '$lib/components/ui';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/stores/toast.svelte';
  import { createAct, updateAct } from '../../../routes/admin/data.remote';
  import type { Act, Media } from '$lib/server/schema';

  /**
   * Who's in a line-up slot, and what that act looks like.
   *
   * Both jobs in one place because they're one decision in practice: you pick
   * an act, and while you're there you give it a logo or fix its name. Spread
   * across a row of small controls it was four unlabelled icons.
   *
   * Acts save immediately rather than through the draft — the same act is on
   * other shows, so a rename or a new logo isn't this show's to stage.
   */
  interface Props {
    /** The act in this slot, or 'new' for an empty one. */
    act: Act | 'new';
    acts: Act[];
    media: Media[];
    /** This slot's stage time, which belongs to the show rather than the act. */
    setTime: string | null;
    locale?: string;
    onsaved: (actId: number, setTime: string | null) => void;
    onclose: () => void;
  }

  let { act, acts, media, setTime, locale = 'nb-NO', onsaved, onclose }: Props = $props();

  /*
   * Read once, in the script body rather than an $effect: the parent mounts
   * this per open, so there is no later value to react to.
   */
  const initial = untrack(() => (act === 'new' ? null : act));

  let selectedId = $state<number | null>(initial?.id ?? null);
  let name = $state(initial?.name ?? '');
  let logoUrl = $state<string | null>(initial?.logoUrl ?? null);
  let stageTime = $state(untrack(() => setTime ?? ''));
  let saving = $state(false);

  const isNew = $derived(selectedId === null);

  /** Switching to an existing act pulls its details in to be edited. */
  function chooseAct(value: string) {
    if (value === '') {
      selectedId = null;
      name = '';
      logoUrl = null;
      return;
    }

    const id = Number(value);
    const existing = acts.find((a) => a.id === id);
    selectedId = id;
    name = existing?.name ?? '';
    logoUrl = existing?.logoUrl ?? null;
  }

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });

  function close() {
    dialogEl?.close();
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    saving = true;
    try {
      let id = selectedId;

      if (id === null) {
        const created = await createAct({ name: trimmed });
        id = created.act.id;
        // A name that already exists returns the existing act, so the logo
        // below still applies to the right row rather than making a twin.
        await updateAct({ id, logoUrl });
      } else {
        await updateAct({ id, name: trimmed, logoUrl });
      }

      await invalidateAll();
      onsaved(id, stageTime || null);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the act');
    } finally {
      saving = false;
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  {onclose}
>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold">{initial ? 'Edit act' : 'Add act'}</h2>
      <button onclick={close} class="text-gray-400 hover:text-white" aria-label="Close dialog">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div class="space-y-4">
      <div>
        <label for="act-choose" class={labelClass}>Act</label>
        <select
          id="act-choose"
          value={selectedId ?? ''}
          onchange={(e) => chooseAct(e.currentTarget.value)}
          class={fieldClass}
        >
          <option value="">New act…</option>
          {#each acts as option (option.id)}
            <option value={option.id}>{option.name}{option.isSelf ? ' (us)' : ''}</option>
          {/each}
        </select>
        <p class="mt-2 text-sm text-gray-500">
          {isNew
            ? 'Give it a name and it joins the list for next time.'
            : 'Editing this act changes it on every show it plays.'}
        </p>
      </div>

      <div>
        <label for="act-name" class={labelClass}>Name</label>
        <input
          id="act-name"
          type="text"
          bind:value={name}
          placeholder="Arania"
          class={fieldClass}
        />
      </div>

      <div>
        <span class={labelClass}>On stage</span>
        <DateTimePicker
          mode="time"
          compact
          value={stageTime}
          {locale}
          onchange={(v) => (stageTime = v)}
        />
        <p class="mt-2 text-sm text-gray-500">
          For this show only — the doors time is on the show itself.
        </p>
      </div>

      <MediaPicker
        value={logoUrl}
        label="Logo"
        {media}
        aspectRatio="1/1"
        kind="image"
        onselect={(url: string | null) => (logoUrl = url)}
      />
    </div>

    <div class="mt-6 flex gap-2">
      <button
        onclick={save}
        disabled={saving || !name.trim()}
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onclick={close}
        class="rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:text-white"
      >
        Cancel
      </button>
    </div>
  </div>
</dialog>
