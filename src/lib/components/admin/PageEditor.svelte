<script lang="ts">
  import { SortableList, LayoutPreview, EditorPreview } from '$lib/components/ui';
  import { LinkEditDialog } from '$lib/components/dialogs';
  import type { LinkValues } from '$lib/components/dialogs/LinkEditDialog.svelte';
  import { blockRegistry } from '$lib/blocks';
  import BlockAdminWrapper from '$lib/blocks/BlockAdminWrapper.svelte';
  import { resolveTheme } from '$lib/themes';
  import { toast } from '$lib/stores/toast.svelte';
  import * as draft from '$lib/stores/pageDraft.svelte';
  import { withResolvedLineups } from '$lib/utils/lineup';
  import type { UnifiedDraftData } from '../../../routes/admin/publishDraft';
  import type { Link, Show, Block, Page, Media, Act, ProductWithTags } from '$lib/server/schema';
  import type { BlockType } from '$lib/blocks/kinds';
  import type { LayoutData } from '../../../routes/admin/$types';
  import { toggleBlockCollapsed } from '../../../routes/admin/data.remote';

  /**
   * The editor for one page's blocks.
   *
   * Both the front page and an ordinary page are edited with this — they
   * differ in where they're reached from and whether they can be deleted, not
   * in what editing them means.
   */
  let {
    pageId,
    pages,
    acts,
    media,
    settings,
    googleConfig
  }: {
    pageId: number;
    pages: Page[];
    /** For resolving a show's line-up in the preview, which holds act ids. */
    acts: Act[];
    media: Media[];
    settings: LayoutData['settings'];
    googleConfig: LayoutData['googleConfig'];
  } = $props();

  // Get reactive draft data - shared with layout and appearance
  const draftData = draft.getData<UnifiedDraftData>();

  /*
   * The shop, for a shop block. Off the draft like everything else here, so a
   * product renamed or repriced a moment ago shows that way in the preview.
   */
  const products = $derived(draftData.products ?? []);

  /*
   * The preview is the public page, and the public page never sees a hidden
   * product. The list above it does — that's where "hidden" is worth knowing.
   */
  const visibleProducts = $derived(products.filter((p) => p.visible));

  /*
   * The draft holds every page's blocks in one array, because one Update
   * button commits the lot. This editor only ever shows, counts and reorders
   * the blocks belonging to the page it was opened for.
   */
  const currentPage = $derived(pages.find((p) => p.id === pageId));
  const pageBlocks = $derived(draftData.blocks.filter((b) => b.pageId === pageId));

  // Live preview settings (merges draft appearance onto server settings)
  const liveSettings = $derived({
    ...settings,
    ...draftData.appearance
  });

  const activeLayout = $derived(resolveTheme(liveSettings.layout));

  // Link edit dialog state
  let editingLink = $state<Link | null>(null);

  function openLinkDialog(link: Link) {
    editingLink = link;
  }

  function closeLinkDialog() {
    editingLink = null;
  }

  // Applied here, like the shows: draftData is this component's state, so
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
      (def) => !def.requiresFeature || settings?.[def.requiresFeature]
    )
  );

  // ===== Block operations =====
  // Typed rather than a loose string: the button that calls this is built from
  // the registry, so a type it doesn't know about can't reach here — and the
  // block it would have written couldn't be saved anyway.
  function handleAddBlock(type: BlockType) {
    const def = blockRegistry[type];
    if (!def) return;

    const newBlock: Block = {
      id: draft.getTempId(),
      pageId: pageId,
      type: type,
      label: def.defaultLabel,
      config: def.defaultConfig,
      visible: true,
      collapsed: false,
      position: pageBlocks.length,
      createdAt: new Date()
    };
    draftData.blocks = [...draftData.blocks, newBlock];
    toast.info(`${def.name} block added`);
  }

  /*
   * Links go with the block that held them. Shows don't — they're the site's,
   * and removing the block that displayed them shouldn't cancel the tour.
   */
  function handleDeleteBlock(id: number) {
    if (!confirm('Delete this block?')) return;
    draftData.blocks = draftData.blocks.filter((b) => b.id !== id);
    draftData.links = draftData.links.filter((l) => l.blockId !== id);
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

  /*
   * The reordered list covers this page only, so it's spliced back into the
   * shared array rather than replacing it: every other page's blocks keep the
   * slots they were already in, and their diff stays clean.
   */
  function handleReorderBlocks(items: Block[]) {
    const queue = items.map((item, i) => ({ ...item, position: i }));
    let next = 0;
    draftData.blocks = draftData.blocks.map((block) =>
      block.pageId === pageId ? queue[next++] : block
    );
  }
</script>

<EditorPreview previewStyle="background-color: {draftData.appearance.colorBg}">
  {#snippet editor()}
    <!--
      The sections don't print their own titles — the nav says where you are.
      This one does, because the nav only gets as far as "Pages", and which
      page you're editing is the part it can't tell you.
    -->
    <div class="mb-4">
      <h1 class="truncate text-lg text-white">{currentPage?.title ?? 'Page'}</h1>
      {#if currentPage?.type === 'landing'}
        <p class="mt-0.5 text-xs text-gray-500">The front page, at the root of the site</p>
      {:else if currentPage}
        <a
          href="/{currentPage.slug}"
          target="_blank"
          rel="noreferrer"
          class="mt-0.5 inline-block text-xs text-gray-500 hover:text-gray-300"
        >
          /{currentPage.slug}
        </a>
      {/if}
    </div>

    <div class="space-y-4">
      {#if pageBlocks.length > 0}
        <SortableList gap="0.5rem" items={pageBlocks} onreorder={handleReorderBlocks}>
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
                  <SettingsComponent {block} {products} />
                {/snippet}
                <AdminComponent
                  {block}
                  bind:profile={draftData.profile}
                  bind:links={draftData.links}
                  bind:shows={draftData.shows}
                  {media}
                  {products}
                  {settings}
                  oneditlink={openLinkDialog}
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
                  bind:shows={draftData.shows}
                  {media}
                  {products}
                  {settings}
                  oneditlink={openLinkDialog}
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
      shows={withResolvedLineups(draftData.shows ?? [], acts)}
      blocks={pageBlocks}
      {media}
      products={visibleProducts}
    />
  {/snippet}
</EditorPreview>

<!-- Link Edit Dialog. Mounted only while open, same as the show dialog. -->
{#if editingLink}
  <LinkEditDialog
    link={editingLink}
    {themeColors}
    onsave={handleLinkSave}
    ondelete={handleLinkDelete}
    onclose={closeLinkDialog}
  />
{/if}
