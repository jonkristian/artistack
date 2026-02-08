<script lang="ts">
  import { ColorWheel, LayoutPreview } from '$lib/components/ui';
  import { SectionCard } from '$lib/components/cards';
  import Default from '$lib/themes/Default.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import type { UnifiedDraftData } from '../publishDraft';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Get reactive draft data - shared with layout and dashboard
  const draftData = draft.getData<UnifiedDraftData>();

  // Track which color picker is open (accordion behavior)
  let openPicker = $state<string | null>(null);

  // Available layouts
  const availableLayouts = [
    { id: 'default', name: 'Default', description: 'Classic centered layout with photo and links' }
  ];

  // Live preview settings (merges draft appearance onto server settings)
  const liveSettings = $derived({
    ...data.settings,
    ...draftData.appearance
  });
</script>

<div class="flex h-screen">
  <!-- Left Column: Settings -->
  <div class="w-1/2 overflow-y-auto bg-gray-950 p-6">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-white">Appearance</h1>
      <p class="text-sm text-gray-500">Customize colors and layout for your page</p>
    </header>

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
        </div>
      </SectionCard>

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
        {#if availableLayouts.length === 1}
          <p class="mt-3 text-xs text-gray-600">More layouts coming soon</p>
        {/if}
      </SectionCard>

      <!-- Options -->
      <SectionCard title="Options">
        <label class="flex cursor-pointer items-center justify-between">
          <div>
            <span class="text-sm font-medium text-white">Show share button</span>
            <p class="text-xs text-gray-500">Display a share button at the bottom of the page</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftData.appearance.showShareButton}
            aria-label="Show share button"
            onclick={() =>
              (draftData.appearance.showShareButton = !draftData.appearance.showShareButton)}
            class="relative h-6 w-11 rounded-full transition-colors {draftData.appearance
              .showShareButton
              ? 'bg-violet-600'
              : 'bg-gray-700'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {draftData
                .appearance.showShareButton
                ? 'translate-x-5'
                : ''}"
            ></span>
          </button>
        </label>
        <label class="mt-4 flex cursor-pointer items-center justify-between">
          <div>
            <span class="text-sm font-medium text-white">Show press kit</span>
            <p class="text-xs text-gray-500">
              Display a press kit download link at the bottom of the page
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftData.appearance.showPressKit}
            aria-label="Show press kit"
            onclick={() => (draftData.appearance.showPressKit = !draftData.appearance.showPressKit)}
            class="relative h-6 w-11 rounded-full transition-colors {draftData.appearance
              .showPressKit
              ? 'bg-violet-600'
              : 'bg-gray-700'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {draftData
                .appearance.showPressKit
                ? 'translate-x-5'
                : ''}"
            ></span>
          </button>
        </label>
      </SectionCard>
    </div>
  </div>

  <!-- Right Column: Live Preview -->
  <div
    class="w-1/2 overflow-y-auto border-l border-gray-800"
    style="background-color: {draftData.appearance.colorBg}"
  >
    <LayoutPreview
      layout={Default}
      profile={draftData.profile}
      settings={liveSettings}
      links={draftData.links}
      tourDates={draftData.tourDates}
      blocks={draftData.blocks}
      media={data.media}
    />
  </div>
</div>
