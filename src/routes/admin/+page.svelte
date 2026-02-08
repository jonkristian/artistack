<script lang="ts">
  import { SortableBlockList, LayoutPreview } from '$lib/components/ui';
  import { LinkEditDialog, TourDateEditDialog } from '$lib/components/dialogs';
  import SetupCard from '$lib/components/admin/SetupCard.svelte';
  import { blockRegistry } from '$lib/blocks';
  import BlockAdminWrapper from '$lib/blocks/BlockAdminWrapper.svelte';
  import Default from '$lib/themes/Default.svelte';
  import { invalidateAll } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { registerPublishHandler, clearPublishHandler } from '$lib/stores/pendingChanges.svelte';
  import { onDestroy } from 'svelte';
  import type { PageData } from './$types';
  import type { Link, TourDate, Block, Profile } from '$lib/server/schema';
  import {
    addBlock as serverAddBlock,
    updateBlock as serverUpdateBlock,
    deleteBlock as serverDeleteBlock,
    reorderBlocks as serverReorderBlocks,
    createLink as serverCreateLink,
    updateLink as serverUpdateLink,
    deleteLink as serverDeleteLink,
    reorderLinks as serverReorderLinks,
    createTourDate as serverCreateTourDate,
    updateTourDate as serverUpdateTourDate,
    deleteTourDate as serverDeleteTourDate,
    saveProfile as serverSaveProfile,
    toggleBlockCollapsed
  } from './data.remote';

  let { data }: { data: PageData } = $props();

  // Initialize draft store once at component creation
  // Using untrack to intentionally capture initial server data without creating a reactive dependency
  untrack(() => {
    const initialData = {
      profile: data.profile ?? { id: 1, name: 'Artist Name' },
      blocks: data.blocks ?? [],
      links: data.links ?? [],
      tourDates: data.tourDates ?? []
    };
    draft.initialize(initialData);
  });

  // Get reactive draft data - components modify this directly
  const draftData = draft.getData<{
    profile: Profile;
    blocks: Block[];
    links: Link[];
    tourDates: TourDate[];
  }>();

  // Check if setup is needed
  let needsSetup = $state(untrack(() => !data.settings?.setupCompleted));

  async function handleSetupComplete() {
    await invalidateAll();
    await tick();
    // Re-initialize draft with new data (which now includes default blocks)
    const freshData = {
      profile: data.profile ?? { id: 1, name: 'Artist Name' },
      blocks: data.blocks ?? [],
      links: data.links ?? [],
      tourDates: data.tourDates ?? []
    };
    draft.initialize(freshData);
    needsSetup = false;
    toast.info('Setup complete! Start customizing your page.');
  }

  // Register save handler - persists all changes
  registerPublishHandler(async () => {
    // Save profile changes
    const profileChanges = draft.computeObjectDiff<Profile>('profile');
    if (profileChanges) {
      if (
        profileChanges.name !== undefined ||
        profileChanges.bio !== undefined ||
        profileChanges.email !== undefined
      ) {
        await serverSaveProfile({
          name: draftData.profile.name || 'Artist Name',
          bio: draftData.profile.bio || undefined,
          email: draftData.profile.email || undefined
        });
      }
    }

    // Process blocks
    const blockDiff = draft.computeCollectionDiff<Block>('blocks');
    for (const id of blockDiff.deleted) {
      await serverDeleteBlock(id);
    }
    const blockIdMap = new Map<number, number>();
    for (const block of blockDiff.added) {
      const result = await serverAddBlock({
        type: block.type as 'profile' | 'links' | 'tour_dates' | 'image' | 'gallery',
        label: block.label ?? undefined,
        config: block.config ?? undefined
      });
      blockIdMap.set(block.id, result.block.id);
    }
    for (const { id, changes } of blockDiff.updated) {
      // Only call update if there are actual fields to update (not just position)
      if (
        changes.label !== undefined ||
        changes.config !== undefined ||
        changes.visible !== undefined
      ) {
        await serverUpdateBlock({
          id,
          label: changes.label ?? undefined,
          config: changes.config,
          visible: changes.visible ?? undefined
        });
      }
    }
    // Always reorder if we added new blocks or if order changed
    if (blockDiff.reordered || blockDiff.added.length > 0) {
      // Map temp IDs to real IDs for newly added blocks
      const reorderData = draftData.blocks
        .map((b, i) => ({
          id: b.id < 0 ? (blockIdMap.get(b.id) ?? b.id) : b.id,
          position: i
        }))
        .filter((b) => b.id > 0); // Filter out any unmapped temp IDs
      await serverReorderBlocks(reorderData);
    }

    // Process links - handle adds, updates, deletes, and reorders
    const linkDiff = draft.computeCollectionDiff<Link>('links');
    const linkIdMap = new Map<number, number>();

    // Delete removed links
    for (const id of linkDiff.deleted) {
      await serverDeleteLink(id);
    }

    // Add new links (e.g., social links from ProfileBlockAdmin)
    for (const link of linkDiff.added) {
      const blockId =
        link.blockId < 0 ? (blockIdMap.get(link.blockId) ?? link.blockId) : link.blockId;
      const result = await serverCreateLink({
        url: link.url,
        blockId,
        category: link.category as 'social' | 'streaming' | 'merch' | 'other',
        platform: link.platform,
        label: link.label ?? undefined
      });
      linkIdMap.set(link.id, result.link.id);
    }

    // Update changed links
    for (const { id, changes } of linkDiff.updated) {
      if (
        changes.label !== undefined ||
        changes.url !== undefined ||
        changes.embedData !== undefined
      ) {
        await serverUpdateLink({
          id,
          label: changes.label,
          url: changes.url,
          embedData: changes.embedData
        });
      }
    }

    // Reorder links per block
    const linkBlockIds = new Set(draftData.links.filter((l) => l.id > 0).map((l) => l.blockId));
    for (const blockId of linkBlockIds) {
      const blockLinks = draftData.links.filter((l) => l.blockId === blockId && l.id > 0);
      await serverReorderLinks(blockLinks.map((l, i) => ({ id: l.id, position: i })));
    }

    // Process tour dates
    const tdDiff = draft.computeCollectionDiff<TourDate>('tourDates');
    for (const id of tdDiff.deleted) {
      await serverDeleteTourDate(id);
    }
    for (const td of tdDiff.added) {
      const blockId = td.blockId < 0 ? (blockIdMap.get(td.blockId) ?? td.blockId) : td.blockId;
      await serverCreateTourDate({
        blockId,
        date: td.date,
        time: td.time ?? undefined,
        title: td.title ?? undefined,
        venue: td.venue,
        lineup: td.lineup ?? undefined,
        ticketUrl: td.ticketUrl ?? undefined,
        eventUrl: td.eventUrl ?? undefined,
        soldOut: td.soldOut ?? false
      });
    }
    for (const { id, changes } of tdDiff.updated) {
      // Only call update if there are actual fields to update (not just position)
      const hasChanges =
        changes.date !== undefined ||
        changes.time !== undefined ||
        changes.title !== undefined ||
        changes.venue !== undefined ||
        changes.lineup !== undefined ||
        changes.ticketUrl !== undefined ||
        changes.eventUrl !== undefined ||
        changes.soldOut !== undefined;
      if (hasChanges) {
        await serverUpdateTourDate({
          id,
          date: changes.date,
          time: changes.time,
          title: changes.title,
          venue: changes.venue,
          lineup: changes.lineup,
          ticketUrl: changes.ticketUrl,
          eventUrl: changes.eventUrl,
          soldOut: changes.soldOut ?? undefined
        });
      }
    }

    // Refresh data from server and re-initialize draft with real IDs
    await invalidateAll();
    await tick();

    const freshData = {
      profile: data.profile ?? { id: 1, name: 'Artist Name' },
      blocks: data.blocks ?? [],
      links: data.links ?? [],
      tourDates: data.tourDates ?? []
    };
    draft.initialize(freshData);
  });

  onDestroy(() => {
    clearPublishHandler();
    draft.reset();
  });

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
    bg: data.settings?.colorBg ?? '#0c0a14',
    card: data.settings?.colorCard ?? '#14101f',
    accent: data.settings?.colorAccent ?? '#8b5cf6'
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
    style="background-color: {data.settings?.colorBg ?? '#0c0a14'}"
  >
    <LayoutPreview
      layout={Default}
      profile={draftData.profile}
      settings={data.settings}
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
