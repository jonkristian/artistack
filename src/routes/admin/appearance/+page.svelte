<script lang="ts">
  import { untrack } from 'svelte';
  import { ColorWheel, EditorPreview, LayoutPreview, ToggleSwitch } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import { fieldClass } from '$lib/utils/classes';
  import { toast } from '$lib/stores/toast.svelte';
  import { saveScheme, removeScheme } from './data.remote';
  import type { ThemeSettings } from '$lib/server/settings';
  import { resolveTheme } from '$lib/themes';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { withResolvedLineups } from '$lib/utils/lineup';
  import type { UnifiedDraftData } from '../publishDraft';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Get reactive draft data - shared with layout and dashboard
  const draftData = draft.getData<UnifiedDraftData>();

  /*
   * Saved palettes.
   *
   * Applying one writes into the draft rather than the database, so it behaves
   * like any other appearance edit: the preview updates immediately, Undo puts
   * the old colours back, and nothing is committed until Update.
   */
  const COLOR_FIELDS = [
    'colorBg',
    'colorCard',
    'colorAccent',
    'colorText',
    'colorTextMuted',
    'colorIcon'
  ] as const;

  let schemes = $state<Record<string, ThemeSettings>>(untrack(() => data.schemes ?? {}));
  let newSchemeName = $state('');
  let savingScheme = $state(false);

  function currentPalette(): ThemeSettings {
    return Object.fromEntries(
      COLOR_FIELDS.map((f) => [f, draftData.appearance[f] as string])
    ) as unknown as ThemeSettings;
  }

  async function handleSaveScheme() {
    const name = newSchemeName.trim();
    if (!name || savingScheme) return;
    savingScheme = true;
    try {
      const result = await saveScheme({ name, palette: currentPalette() });
      schemes = result.schemes;
      newSchemeName = '';
      toast.info(`Saved “${name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the scheme');
    }
    savingScheme = false;
  }

  function applyScheme(palette: ThemeSettings) {
    for (const f of COLOR_FIELDS) draftData.appearance[f] = palette[f];
  }

  async function handleRemoveScheme(name: string) {
    if (!confirm(`Delete the “${name}” scheme?`)) return;
    try {
      const result = await removeScheme({ name });
      schemes = result.schemes;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the scheme');
    }
  }

  // Track which color picker is open (accordion behavior)
  let openPicker = $state<string | null>(null);

  // Available layouts
  const availableLayouts = [
    {
      id: 'default',
      name: 'Default',
      description: 'Classic centered layout with card and gradient border'
    },
    { id: 'simple', name: 'Simple', description: 'Clean, centered layout without card' }
  ];

  const activeLayout = $derived(resolveTheme(draftData.appearance.layout));

  // Live preview settings (merges draft appearance onto server settings)
  const liveSettings = $derived({
    ...data.settings,
    ...draftData.appearance
  });
</script>

<EditorPreview previewStyle="background-color: {draftData.appearance.colorBg}">
  {#snippet editor()}
    <div class="space-y-6">
      <!-- Colors -->
      <SectionCard title="Colors">
        <div class="flex flex-wrap gap-4">
          <ColorWheel
            value={draftData.appearance.colorBg}
            onchange={(c) => (draftData.appearance.colorBg = c)}
            label="Background"
            open={openPicker === 'bg'}
            ontoggle={(o) => (openPicker = o ? 'bg' : null)}
          />
          <ColorWheel
            value={draftData.appearance.colorCard}
            onchange={(c) => (draftData.appearance.colorCard = c)}
            label="Card"
            open={openPicker === 'card'}
            ontoggle={(o) => (openPicker = o ? 'card' : null)}
          />
          <ColorWheel
            value={draftData.appearance.colorAccent}
            onchange={(c) => (draftData.appearance.colorAccent = c)}
            label="Accent"
            open={openPicker === 'accent'}
            ontoggle={(o) => (openPicker = o ? 'accent' : null)}
          />
          <ColorWheel
            value={draftData.appearance.colorText}
            onchange={(c) => (draftData.appearance.colorText = c)}
            label="Text"
            open={openPicker === 'text'}
            ontoggle={(o) => (openPicker = o ? 'text' : null)}
          />
          <ColorWheel
            value={draftData.appearance.colorTextMuted}
            onchange={(c) => (draftData.appearance.colorTextMuted = c)}
            label="Muted"
            open={openPicker === 'muted'}
            ontoggle={(o) => (openPicker = o ? 'muted' : null)}
          />
          <ColorWheel
            value={draftData.appearance.colorIcon}
            onchange={(c) => (draftData.appearance.colorIcon = c)}
            label="Icons"
            open={openPicker === 'icon'}
            ontoggle={(o) => (openPicker = o ? 'icon' : null)}
          />
        </div>
      </SectionCard>

      <div class="mt-6">
        <SectionCard title="Schemes">
          <p class="-mt-2 mb-3 text-xs text-gray-500">
            Save the palette above under a name, then switch between them. Applying one is an edit
            like any other — it lands with Update, and Undo puts the old colours back.
          </p>

          {#if Object.keys(schemes).length > 0}
            <ul class="mb-4 flex flex-col gap-2">
              {#each Object.entries(schemes) as [name, palette] (name)}
                <li
                  class="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950 p-2.5"
                >
                  <!-- The palette itself is the label; a name alone tells you
                       nothing about what you're about to apply. -->
                  <div class="flex shrink-0 gap-1">
                    {#each COLOR_FIELDS as field (field)}
                      <span
                        class="h-5 w-5 rounded-full border border-white/10"
                        style="background-color: {palette[field]}"
                        title={palette[field]}
                      ></span>
                    {/each}
                  </div>
                  <span class="min-w-0 flex-1 truncate text-sm text-gray-200">{name}</span>
                  <button
                    type="button"
                    onclick={() => applyScheme(palette)}
                    class="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-600 hover:text-white"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onclick={() => handleRemoveScheme(name)}
                    class="shrink-0 px-1 text-xs text-gray-600 transition hover:text-red-400"
                    aria-label="Delete the {name} scheme"
                  >
                    Delete
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <div class="flex flex-wrap items-center gap-2">
            <input
              class="{fieldClass} min-w-40 flex-1"
              placeholder="Name this palette"
              bind:value={newSchemeName}
              onkeydown={(e) => e.key === 'Enter' && handleSaveScheme()}
            />
            <button
              type="button"
              onclick={handleSaveScheme}
              disabled={savingScheme || !newSchemeName.trim()}
              class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {savingScheme ? 'Saving…' : 'Save current'}
            </button>
          </div>
        </SectionCard>
      </div>

      <!-- Layout -->
      <SectionCard title="Layout">
        <div class="space-y-2">
          {#each availableLayouts as l (l.id)}
            <label
              class="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 transition-colors {draftData
                .appearance.layout === l.id
                ? 'bg-white/10 ring-1 ring-white/20'
                : 'bg-gray-800/50 hover:bg-gray-800'}"
            >
              <input
                type="radio"
                name="layout"
                value={l.id}
                bind:group={draftData.appearance.layout}
                class="h-4 w-4 border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-gray-900"
              />
              <div>
                <span class="text-sm font-medium text-white">{l.name}</span>
                <p class="text-xs text-gray-500">{l.description}</p>
              </div>
            </label>
          {/each}
        </div>
      </SectionCard>

      <!-- Options -->
      <SectionCard title="Options">
        <label class="flex cursor-pointer items-center justify-between">
          <div>
            <span class="text-sm font-medium text-white">Show share button</span>
            <p class="text-xs text-gray-500">Display a share button at the bottom of the page</p>
          </div>
          <ToggleSwitch
            bind:checked={draftData.appearance.showShareButton}
            label="Show share button"
            size="md"
            hideLabel
          />
        </label>
        <label class="mt-4 flex cursor-pointer items-center justify-between">
          <div>
            <span class="text-sm font-medium text-white">Show press kit</span>
            <p class="text-xs text-gray-500">
              Display a press kit download link at the bottom of the page
            </p>
          </div>
          <ToggleSwitch
            bind:checked={draftData.appearance.showPressKit}
            label="Show press kit"
            size="md"
            hideLabel
          />
        </label>
      </SectionCard>
    </div>
  {/snippet}

  {#snippet preview()}
    <LayoutPreview
      layout={activeLayout}
      profile={draftData.profile}
      settings={liveSettings}
      links={draftData.links}
      shows={withResolvedLineups(draftData.shows ?? [], data.acts ?? [])}
      blocks={draftData.blocks}
      media={data.media}
    />
  {/snippet}
</EditorPreview>
