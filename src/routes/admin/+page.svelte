<script lang="ts">
  import { SortableList, LayoutPreview, EditorPreview } from '$lib/components/ui';
  import { LinkEditDialog, TourDateEditDialog } from '$lib/components/dialogs';
  import type { TourDateValues } from '$lib/components/dialogs/TourDateEditDialog.svelte';
  import type { LinkValues } from '$lib/components/dialogs/LinkEditDialog.svelte';
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

  // Applied here, like the tour dates: draftData is this component's state, so
  // the child handing values back is what keeps reactivity honest.
  function handleLinkSave(values: LinkValues) {
    const editing = editingLink;
    if (editing) {
      const target = draftData.links.find((l) => l.id === editing.id);
      if (target) Object.assign(target, values);
      toast.info('Link updated');
    }
    closeLinkDialog();
  }

  function handleLinkDelete(id: number) {
    const index = draftData.links.findIndex((l) => l.id === id);
    if (index !== -1) draftData.links.splice(index, 1);
    toast.info('Link deleted');
    closeLinkDialog();
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

  /*
   * Applied here rather than inside the dialog. The dialog is passed a plain
   * prop, not `bind:`, so mutating it from there tripped Svelte's ownership
   * warning; the block admins below use `bind:` and mutate directly.
   */
  function handleTourDateSave(values: TourDateValues) {
    // Copied to a local so it narrows inside the find() callback.
    const editing = editingTourDate;

    if (editing === 'new') {
      const blockId = editingTourDateBlockId ?? 0;
      draftData.tourDates.push({
        id: draft.getTempId(),
        blockId,
        position: draftData.tourDates.filter((t) => t.blockId === blockId).length,
        ...values
      });
      toast.info('Tour date added');
    } else if (editing) {
      const target = draftData.tourDates.find((t) => t.id === editing.id);
      if (target) Object.assign(target, values);
      toast.info('Tour date updated');
    }
    closeTourDateDialog();
  }

  function handleTourDateDelete(id: number) {
    const index = draftData.tourDates.findIndex((t) => t.id === id);
    if (index !== -1) draftData.tourDates.splice(index, 1);
    toast.info('Tour date deleted');
    closeTourDateDialog();
  }

  // Theme colors for embed options
  const themeColors = $derived({
    bg: draftData.appearance.colorBg,
    card: draftData.appearance.colorCard,
    accent: draftData.appearance.colorAccent
  });

  /*
   * A block can depend on a feature being switched on. Offering a sign-up
   * block while the fan list is off would put a form on the page that posts
   * into a 404.
   */
  const availableBlocks = $derived(
    Object.values(blockRegistry).filter(
      (def) => !def.requiresFeature || data.settings?.[def.requiresFeature]
    )
  );

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

<EditorPreview previewStyle="background-color: {draftData.appearance.colorBg}">
  {#snippet editor()}
    <!-- Setup Card (shown on first visit) -->
    {#if needsSetup}
      <SetupCard settings={data.settings} oncomplete={handleSetupComplete} />
    {/if}

    <div class="space-y-4">
      {#if draftData.blocks?.length > 0}
        <SortableList gap="0.5rem" items={draftData.blocks} onreorder={handleReorderBlocks}>
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
        </SortableList>
      {:else}
        <div class="rounded-xl border border-dashed border-gray-700 py-12 text-center">
          <p class="mb-2 text-sm text-gray-400">No blocks yet</p>
          <p class="text-xs text-gray-600">Add blocks to build your page</p>
        </div>
      {/if}

      <!-- Add Block -->
      <div class="flex flex-wrap gap-2">
        {#each availableBlocks as def}
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
  {/snippet}

  {#snippet preview()}
    <LayoutPreview
      layout={activeLayout}
      profile={draftData.profile}
      settings={liveSettings}
      links={draftData.links}
      tourDates={draftData.tourDates}
      blocks={draftData.blocks}
      media={data.media}
    />
  {/snippet}
</EditorPreview>

<!-- Link Edit Dialog. Mounted only while open, same as the tour date dialog. -->
{#if editingLink}
  <LinkEditDialog
    link={editingLink}
    {themeColors}
    onsave={handleLinkSave}
    ondelete={handleLinkDelete}
    onclose={closeLinkDialog}
  />
{/if}

<!-- Tour Date Edit Dialog -->
<!-- Mounted only while open, so the form initialises on mount instead of
     needing an effect to copy the selected date into local state. -->
{#if editingTourDate}
  <TourDateEditDialog
    tourDate={editingTourDate}
    googleApiKey={data.googleConfig?.placesEnabled ? data.googleConfig.apiKey : null}
    onsave={handleTourDateSave}
    ondelete={handleTourDateDelete}
    onclose={closeTourDateDialog}
  />
{/if}
