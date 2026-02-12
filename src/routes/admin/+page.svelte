<script lang="ts">
  import { SortableBlockList, LayoutPreview } from '$lib/components/ui';
  import { LinkEditDialog, TourDateEditDialog } from '$lib/components/dialogs';
  import SetupCard from '$lib/components/admin/SetupCard.svelte';
  import { blockRegistry } from '$lib/blocks';
  import BlockAdminWrapper from '$lib/blocks/BlockAdminWrapper.svelte';
  import Default from '$lib/themes/Default.svelte';
  import Simple from '$lib/themes/Simple.svelte';
  import { invalidateAll } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { buildDraftFromServerData } from './publishDraft';
  import type { UnifiedDraftData } from './publishDraft';
  import type { PageData } from './$types';
  import type { Link, TourDate, Block } from '$lib/server/schema';
  import { toggleBlockCollapsed } from './data.remote';

  let { data }: { data: PageData } = $props();

  // Get reactive draft data - shared with layout and appearance
  const draftData = draft.getData<UnifiedDraftData>();

  // Check if setup is needed
  let needsSetup = $state(untrack(() => !data.settings?.setupCompleted));

  async function handleSetupComplete() {
    await invalidateAll();
    await tick();
    // Re-initialize draft with new data (which now includes default blocks)
    draft.initialize(buildDraftFromServerData(data));
    needsSetup = false;
    toast.info('Setup complete! Start customizing your page.');
  }

  // Live preview settings (merges draft appearance onto server settings)
  const liveSettings = $derived({
    ...data.settings,
    ...draftData.appearance
  });

  const layoutComponents = { default: Default, simple: Simple } as const;
  const activeLayout = $derived(
    layoutComponents[(liveSettings.layout as keyof typeof layoutComponents) ?? 'default'] ?? Default
  );

  // Link edit dialog state
  let editingLink = $state<Link | null>(null);

  function openLinkDialog(link: Link) {
    editingLink = link;
  }

  function closeLinkDialog() {
    editingLink = null;
  }

  // Tour date edit dialog state
  let editingTourDate = $state<TourDate | 'new' | null>(null);
  let editingTourDateBlockId = $state<number | undefined>(undefined);

  function openTourDateDialog(tourDate: TourDate | 'new', blockId?: number) {
    editingTourDate = tourDate;
    editingTourDateBlockId = blockId;
  }

  function closeTourDateDialog() {
    editingTourDate = null;
    editingTourDateBlockId = undefined;
  }

  // Theme colors for embed options
  const themeColors = $derived({
    bg: draftData.appearance.colorBg,
    card: draftData.appearance.colorCard,
    accent: draftData.appearance.colorAccent
  });

  // ===== Block operations =====
  function handleAddBlock(type: string) {
    const def = blockRegistry[type];
    if (!def) return;

    const newBlock: Block = {
      id: draft.getTempId(),
      pageId: null, // null = home page
      type: type,
      label: def.defaultLabel,
      config: def.defaultConfig,
      visible: true,
      collapsed: false,
      position: draftData.blocks.length,
      createdAt: new Date()
    };
    draftData.blocks = [...draftData.blocks, newBlock];
    toast.info(`${def.name} block added`);
  }

  function handleDeleteBlock(id: number) {
    if (!confirm('Delete this block?')) return;
    draftData.blocks = draftData.blocks.filter((b) => b.id !== id);
    draftData.links = draftData.links.filter((l) => l.blockId !== id);
    draftData.tourDates = draftData.tourDates.filter((t) => t.blockId !== id);
  }

  function handleToggleVisibility(id: number, visible: boolean) {
    const block = draftData.blocks.find((b) => b.id === id);
    if (block) block.visible = visible;
  }

  function handleToggleCollapsed(id: number, collapsed: boolean) {
    const block = draftData.blocks.find((b) => b.id === id);
    if (block) block.collapsed = collapsed;
    if (id > 0) {
      toggleBlockCollapsed({ id, collapsed });
    }
  }

  function handleReorderBlocks(items: Block[]) {
    draftData.blocks = items.map((item, i) => ({ ...item, position: i }));
  }
</script>

<div class="flex h-screen">
  <!-- Left Column: Edit Controls -->
  <div class="w-1/2 overflow-y-auto bg-gray-950 p-6">
    <!-- Setup Card (shown on first visit) -->
    {#if needsSetup}
      <SetupCard settings={data.settings} oncomplete={handleSetupComplete} />
    {/if}

    <div class="space-y-4">
      {#if draftData.blocks?.length > 0}
        <SortableBlockList items={draftData.blocks} onreorder={handleReorderBlocks}>
          {#snippet children(block: Block)}
            {@const def = blockRegistry[block.type]}
            {#if def?.adminSettingsComponent}
              {@const SettingsComponent = def.adminSettingsComponent}
              {@const AdminComponent = def.adminComponent}
              <BlockAdminWrapper
                {block}
                ondelete={handleDeleteBlock}
                ontogglevisibility={handleToggleVisibility}
                ontogglecollapsed={handleToggleCollapsed}
              >
                {#snippet settings()}
                  <SettingsComponent {block} />
                {/snippet}
                <AdminComponent
                  {block}
                  bind:profile={draftData.profile}
                  bind:links={draftData.links}
                  bind:tourDates={draftData.tourDates}
                  media={data.media}
                  oneditlink={openLinkDialog}
                  onedittourdate={(t: TourDate) => openTourDateDialog(t)}
                  onaddtourdate={(blockId: number) => openTourDateDialog('new', blockId)}
                />
              </BlockAdminWrapper>
            {:else if def}
              {@const AdminComponent = def.adminComponent}
              <BlockAdminWrapper
                {block}
                ondelete={handleDeleteBlock}
                ontogglevisibility={handleToggleVisibility}
                ontogglecollapsed={handleToggleCollapsed}
              >
                <AdminComponent
                  {block}
                  bind:profile={draftData.profile}
                  bind:links={draftData.links}
                  bind:tourDates={draftData.tourDates}
                  media={data.media}
                  oneditlink={openLinkDialog}
                  onedittourdate={(t: TourDate) => openTourDateDialog(t)}
                  onaddtourdate={(blockId: number) => openTourDateDialog('new', blockId)}
                />
              </BlockAdminWrapper>
            {/if}
          {/snippet}
        </SortableBlockList>
      {:else}
        <div class="rounded-xl border border-dashed border-gray-700 py-12 text-center">
          <p class="mb-2 text-sm text-gray-400">No blocks yet</p>
          <p class="text-xs text-gray-600">Add blocks to build your page</p>
        </div>
      {/if}

      <!-- Add Block -->
      <div class="flex flex-wrap gap-2">
        {#each Object.values(blockRegistry) as def}
          <button
            onclick={() => handleAddBlock(def.type)}
            class="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-700 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={def.icon} />
            </svg>
            {def.name}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Right Column: Live Preview -->
  <div
    class="w-1/2 overflow-y-auto border-l border-gray-800"
    style="background-color: {draftData.appearance.colorBg}"
  >
    <LayoutPreview
      layout={activeLayout}
      profile={draftData.profile}
      settings={liveSettings}
      links={draftData.links}
      tourDates={draftData.tourDates}
      blocks={draftData.blocks}
      media={data.media}
    />
  </div>
</div>

<!-- Link Edit Dialog -->
<LinkEditDialog
  link={editingLink}
  links={draftData.links}
  {themeColors}
  onclose={closeLinkDialog}
/>

<!-- Tour Date Edit Dialog -->
<TourDateEditDialog
  tourDate={editingTourDate}
  tourDates={draftData.tourDates}
  blockId={editingTourDateBlockId}
  googleApiKey={data.googleConfig?.placesEnabled ? data.googleConfig.apiKey : null}
  onclose={closeTourDateDialog}
/>
