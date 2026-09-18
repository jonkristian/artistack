<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { SectionCard } from '$lib/components/cards';
  import { SortableList, TagInput, SaveStatus } from '$lib/components/ui';
  import { Autosave } from '$lib/utils/autosave.svelte';
  import { updateIdentity } from '../data.remote';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Seeded once. The form owns these from here, and saving doesn't reload them.
  const initial = untrack(() => data.identity);

  const TYPES = [
    { value: 'group', label: 'Band or group', hint: 'Several people under one name.' },
    { value: 'solo', label: 'Solo artist', hint: 'One person making music.' },
    { value: 'other', label: 'Person', hint: 'A personal site, or work other than music.' }
  ] as const;

  let type = $state(initial.type);
  let genres = $state([...initial.genres]);
  let hometown = $state(initial.hometown ?? '');
  let formed = $state(initial.formed ?? '');
  let profiles = $state(initial.profiles.join('\n'));

  // Ids for the list only — SortableList keys on them. Not stored.
  type MemberRow = { id: number; name: string; role: string; from: string; until: string };
  let nextId = 1;
  let members = $state<MemberRow[]>(
    initial.members.map((m) => ({
      id: nextId++,
      name: m.name,
      role: m.role ?? '',
      from: m.from ?? '',
      until: m.until ?? ''
    }))
  );

  function addMember() {
    members.push({ id: nextId++, name: '', role: '', from: '', until: '' });
  }

  function removeMember(id: number) {
    members = members.filter((m) => m.id !== id);
  }

  /** One address per line; a line that isn't one is left out rather than refused. */
  const profileLines = $derived(
    profiles
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const validProfiles = $derived(profileLines.filter((line) => URL.canParse(line)));
  const invalidProfiles = $derived(profileLines.length - validProfiles.length);

  const payload = $derived({
    type,
    genres,
    hometown: hometown.trim() || null,
    formed: formed.trim() || null,
    // A row still waiting for its name is being typed, not saved.
    members: members
      .filter((m) => m.name.trim())
      .map(({ name, role, from, until }) => ({
        name: name.trim(),
        role: role.trim() || null,
        from: from.trim() || null,
        until: until.trim() || null
      })),
    profiles: validProfiles
  });

  // Saves as you go, like General: there's no Save button to forget.
  const autosave = new Autosave();
  let timer: ReturnType<typeof setTimeout>;
  let seeded = false;

  $effect(() => {
    const snapshot = $state.snapshot(payload);
    if (!seeded) {
      seeded = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      autosave.run('the identity', () => updateIdentity(snapshot));
    }, 600);
  });

  const isGroup = $derived(type === 'group');
</script>

<div class="sticky top-0 z-30 flex h-0 max-w-2xl justify-end">
  <SaveStatus {autosave} />
</div>

<div class="max-w-2xl space-y-6">
  <SectionCard title="Who this is for">
    <p class="-mt-2 mb-4 text-xs text-gray-500">
      Describes who the site is about to search engines, so a search for the name finds you rather
      than something else called the same. Not shown on the site.
    </p>

    <div class="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What this site is for">
      {#each TYPES as option (option.value)}
        <label
          class="cursor-pointer rounded-lg border px-3 py-2.5 transition-colors {type ===
          option.value
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-gray-700 hover:border-gray-600'}"
        >
          <input type="radio" class="sr-only" bind:group={type} value={option.value} />
          <span class="block text-sm text-white">{option.label}</span>
          <span class="block text-xs text-gray-500">{option.hint}</span>
        </label>
      {/each}
    </div>

    <div class="mt-4 space-y-4">
      {#if type !== 'other'}
        <div>
          <span class={labelClass}>Genres</span>
          <TagInput
            initial={genres}
            placeholder="Add a genre…"
            onchange={(names) => (genres = names)}
          />
        </div>
      {/if}

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class={labelClass} for="artist-hometown">Hometown</label>
          <input
            id="artist-hometown"
            class={fieldClass}
            bind:value={hometown}
            placeholder="Trondheim, Norway"
          />
        </div>
        <div>
          <label class={labelClass} for="artist-formed">
            {isGroup ? 'Formed' : 'Active since'}
          </label>
          <input
            id="artist-formed"
            class={fieldClass}
            bind:value={formed}
            inputmode="numeric"
            placeholder="2024"
          />
        </div>
      </div>
    </div>
  </SectionCard>

  {#if isGroup}
    <SectionCard title="Members">
      {#snippet actions()}
        <button
          type="button"
          class="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
          onclick={addMember}
        >
          Add member
        </button>
      {/snippet}
      <p class="-mt-2 mb-3 text-xs text-gray-500">
        Everyone in the band, past members included. Years only; leave "Until" empty for anyone
        still in it.
      </p>

      {#if members.length > 0}
        <SortableList bind:items={members}>
          {#snippet children(member: MemberRow)}
            <div class="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2">
              <div
                data-drag-handle
                class="shrink-0 cursor-grab text-gray-600 hover:text-gray-400"
                aria-label="Drag to reorder"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 8h16M4 16h16"
                  />
                </svg>
              </div>
              <!-- Widths on wrappers: fieldClass carries its own w-full. -->
              <div class="min-w-0 flex-[2]">
                <input
                  class={fieldClass}
                  bind:value={member.name}
                  placeholder="Name"
                  aria-label="Name"
                />
              </div>
              <div class="min-w-0 flex-[2]">
                <input
                  class={fieldClass}
                  bind:value={member.role}
                  placeholder="Vocals, guitar"
                  aria-label="Role"
                />
              </div>
              <div class="w-20 shrink-0">
                <input
                  class={fieldClass}
                  bind:value={member.from}
                  inputmode="numeric"
                  placeholder="From"
                  aria-label="Joined"
                />
              </div>
              <div class="w-20 shrink-0">
                <input
                  class={fieldClass}
                  bind:value={member.until}
                  inputmode="numeric"
                  placeholder="Until"
                  aria-label="Left"
                />
              </div>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-gray-600 transition-colors hover:bg-gray-700 hover:text-red-400"
                onclick={() => removeMember(member.id)}
                aria-label="Remove {member.name || 'member'}"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          {/snippet}
        </SortableList>
      {:else}
        <p class="text-sm text-gray-500">No members yet.</p>
      {/if}
    </SectionCard>
  {/if}

  <SectionCard title="Other official pages">
    <p class="-mt-2 mb-3 text-xs text-gray-500">
      Pages about you elsewhere that aren't buttons on the site — MusicBrainz, Wikidata, Urørt. The
      profiles already linked from the front page are included on their own.
    </p>
    <textarea
      class="{fieldClass} font-mono"
      rows="4"
      bind:value={profiles}
      placeholder="https://musicbrainz.org/artist/…"
      aria-label="Other official pages, one per line"></textarea>
    {#if invalidProfiles > 0}
      <p class="mt-2 text-xs text-amber-400">
        {invalidProfiles === 1 ? 'One line isn’t' : `${invalidProfiles} lines aren’t`} a full address
        and {invalidProfiles === 1 ? 'is' : 'are'} left out.
      </p>
    {/if}
  </SectionCard>
</div>
