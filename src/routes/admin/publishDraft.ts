import type { BlockType } from '$lib/blocks/kinds';
import * as draft from '$lib/stores/pageDraft.svelte';
import type { Profile, Block, Link, Show, Product, ProductWithTags } from '$lib/server/schema';
import {
  addBlock as serverAddBlock,
  updateBlock as serverUpdateBlock,
  deleteBlock as serverDeleteBlock,
  reorderBlocks as serverReorderBlocks,
  createLink as serverCreateLink,
  updateLink as serverUpdateLink,
  deleteLink as serverDeleteLink,
  reorderLinks as serverReorderLinks,
  createShow as serverCreateShow,
  updateShow as serverUpdateShow,
  deleteShow as serverDeleteShow,
  saveProfile as serverSaveProfile
} from './data.remote';
import { updateAppearance } from './appearance/data.remote';
import { updateRelease as serverUpdateRelease } from './releases/data.remote';
import { updateProduct as serverUpdateProduct } from './shop/data.remote';

// ===== Types =====

export type AppearanceData = {
  colorBg: string;
  colorCard: string;
  colorAccent: string;
  colorText: string;
  colorTextMuted: string;
  colorIcon: string;
  layout: 'default' | 'simple';
  showShareButton: boolean;
  showPressKit: boolean;
};

export type UnifiedDraftData = {
  profile: Profile;
  blocks: Block[];
  links: Link[];
  shows: ShowDraft[];
  products: ProductWithTags[];
  appearance: AppearanceData;
  releases: ReleaseDraft[];
};

/**
 * A release and the page that addresses it, flattened into one draft row.
 *
 * The two-table split exists so `pages` can own every URL; it isn't something
 * the editor should have to know about, and keeping it out of the draft means
 * one diff decides what to write to both.
 *
 * `releaseDate` is a yyyy-mm-dd string rather than a Date because the draft is
 * compared by JSON round-trip — a Date would stringify differently after a
 * clone and read as dirty when nothing had changed.
 */
/**
 * A show and its line-up, flattened into one draft row.
 *
 * The join between shows and acts exists so running order can belong to the
 * night rather than to either end of it; that isn't something the editor
 * should carry, and keeping it out means one diff decides what to write to
 * both tables.
 */
export type LineupEntry = { actId: number; setTime: string | null };

export type ShowDraft = Show & { lineup: LineupEntry[] };

export type ReleaseDraft = {
  id: number;
  pageId: number;
  title: string;
  slug: string;
  description: string | null;
  shareImageUrl: string | null;
  published: boolean;
  releaseDate: string;
  coverUrl: string | null;
  presaveUrl: string | null;
  isrc: string | null;
  upc: string | null;
};

/*
 * Dates cross this boundary as local parts, never through UTC: toISOString()
 * shifts the day, and a release showing as the 17th when it's the 18th is a
 * real bug rather than a rounding detail.
 */

export function toDateInput(date: Date | string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// ===== Helpers =====

/**
 * Build draft data from server layout data.
 * Single source of truth for mapping server data → draft shape.
 */
export function buildDraftFromServerData(data: {
  profile: Profile | null;
  blocks: Block[];
  links: Link[];
  shows: ShowDraft[];
  products: ProductWithTags[];
  releases?: {
    id: number;
    pageId: number;
    title: string;
    slug: string;
    description: string | null;
    shareImageUrl: string | null;
    published: boolean | null;
    releaseDate: Date;
    coverUrl: string | null;
    presaveUrl: string | null;
    isrc: string | null;
    upc: string | null;
  }[];
  settings: {
    colorBg?: string | null;
    colorCard?: string | null;
    colorAccent?: string | null;
    colorText?: string | null;
    colorTextMuted?: string | null;
    colorIcon?: string | null;
    layout?: string | null;
    showShareButton?: boolean | null;
    showPressKit?: boolean | null;
  } | null;
}): UnifiedDraftData {
  const s = data.settings;
  return {
    profile: data.profile ?? ({ id: 1, name: 'Artist Name' } as Profile),
    blocks: data.blocks ?? [],
    links: data.links ?? [],
    shows: data.shows ?? [],
    products: data.products ?? [],
    releases: (data.releases ?? []).map((r) => ({
      ...r,
      published: r.published ?? false,
      releaseDate: toDateInput(r.releaseDate)
    })),
    appearance: {
      colorBg: s?.colorBg ?? '#0c0a14',
      colorCard: s?.colorCard ?? '#14101f',
      colorAccent: s?.colorAccent ?? '#8b5cf6',
      colorText: s?.colorText ?? '#f4f4f5',
      colorTextMuted: s?.colorTextMuted ?? '#a1a1aa',
      colorIcon: s?.colorIcon ?? '#a1a1aa',
      layout: (s?.layout as AppearanceData['layout']) ?? 'default',
      showShareButton: s?.showShareButton !== false,
      showPressKit: s?.showPressKit ?? false
    }
  };
}

// ===== Publish =====

/**
 * Publish all changed sections. Only sends requests for sections that actually changed.
 */
export async function publishAllChanges(draftData: UnifiedDraftData) {
  // --- Profile ---
  if (draft.hasChanges('profile')) {
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
  }

  // --- Blocks ---
  const blockIdMap = new Map<number, number>();
  if (draft.hasChanges('blocks')) {
    const blockDiff = draft.computeCollectionDiff<Block>('blocks');

    for (const id of blockDiff.deleted) {
      await serverDeleteBlock(id);
    }

    for (const block of blockDiff.added) {
      if (block.pageId == null) {
        // The editor sets this from the page it's editing. Reaching the server
        // without it would land the block on no page at all.
        throw new Error('A new block arrived with no page to belong to.');
      }
      const result = await serverAddBlock({
        pageId: block.pageId,
        type: block.type as BlockType,
        label: block.label ?? undefined,
        config: block.config ?? undefined
      });
      blockIdMap.set(block.id, result.block.id);
    }

    for (const { id, changes } of blockDiff.updated) {
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

    if (blockDiff.reordered || blockDiff.added.length > 0) {
      /*
       * Numbered within each page rather than across the draft. The blocks of
       * every page share one array here, so indexing the array itself would
       * give the second page's first block a position after the first page's
       * last — and reordering one page would renumber the others.
       */
      const byPage = new Map<number, Block[]>();
      for (const block of draftData.blocks) {
        if (block.pageId == null) continue;
        const list = byPage.get(block.pageId);
        if (list) list.push(block);
        else byPage.set(block.pageId, [block]);
      }

      const reorderData = [...byPage.values()]
        .flatMap((pageBlocks) =>
          pageBlocks.map((b, i) => ({
            id: b.id < 0 ? (blockIdMap.get(b.id) ?? b.id) : b.id,
            position: i
          }))
        )
        .filter((b) => b.id > 0);
      await serverReorderBlocks(reorderData);
    }
  }

  // --- Links ---
  const deletedBlockIds = draft.hasChanges('blocks')
    ? new Set(draft.computeCollectionDiff<Block>('blocks').deleted)
    : new Set<number>();

  if (draft.hasChanges('links')) {
    const linkDiff = draft.computeCollectionDiff<Link>('links');
    const originalLinks = draft.getSnapshot<Link[]>('links') ?? [];

    for (const id of linkDiff.deleted) {
      // Skip links whose block was already deleted (cascade-deleted by server)
      const originalLink = originalLinks.find((l) => l.id === id);
      if (originalLink?.blockId != null && deletedBlockIds.has(originalLink.blockId)) continue;
      await serverDeleteLink(id);
    }

    for (const link of linkDiff.added) {
      // A block-owned link may point at a block created in this same publish,
      // so its temp id is remapped first. A release link has a real owner
      // already — the release exists before its editor opens.
      const blockId =
        link.blockId == null
          ? undefined
          : link.blockId < 0
            ? (blockIdMap.get(link.blockId) ?? link.blockId)
            : link.blockId;

      await serverCreateLink({
        url: link.url,
        blockId,
        releaseId: link.releaseId ?? undefined,
        category: (link.category as 'social' | 'streaming' | 'merch' | 'other') ?? undefined,
        platform: link.platform ?? undefined,
        label: link.label ?? undefined
      });
    }

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

    const linkBlockIds = new Set(draftData.links.filter((l) => l.id > 0).map((l) => l.blockId));
    for (const blockId of linkBlockIds) {
      const blockLinks = draftData.links
        .filter((l) => l.blockId === blockId && l.id > 0)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      await serverReorderLinks(blockLinks.map((l, i) => ({ id: l.id, position: i })));
    }
  }

  // --- Products ---
  if (draft.hasChanges('products')) {
    const productDiff = draft.computeCollectionDiff<ProductWithTags>('products');

    /*
     * Only changed fields are sent, which is what keeps stock safe: a sale
     * decrements it on the server, and publishing a page you happened to have
     * open would otherwise write back the number you loaded before the sale.
     */
    for (const { id, changes } of productDiff.updated) {
      if (Object.keys(changes).length === 0) continue;

      /*
       * Tags go over as names. The draft holds whole tags so it can compare
       * them without a rename reading as an edit, but the server resolves names
       * to ids itself — that's what keeps one vocabulary rather than letting a
       * client invent tag ids.
       */
      const { tags, ...fields } = changes as Partial<ProductWithTags>;
      await serverUpdateProduct({
        id,
        ...fields,
        ...(tags ? { tags: tags.map((t) => t.name) } : {})
      });
    }
  }

  // --- Shows ---
  if (draft.hasChanges('shows')) {
    const tdDiff = draft.computeCollectionDiff<ShowDraft>('shows');

    /*
     * No block to reconcile against any more. A show outlives whatever was
     * displaying it, so deleting one is unconditional — there's no cascade to
     * have got there first — and creating one needs no owner.
     */
    for (const id of tdDiff.deleted) {
      await serverDeleteShow(id);
    }

    for (const td of tdDiff.added) {
      await serverCreateShow({
        date: td.date,
        doorsTime: td.doorsTime ?? undefined,
        title: td.title ?? undefined,
        venue: td.venue,
        lineup: td.lineup,
        imageUrl: td.imageUrl ?? undefined,
        ticketUrl: td.ticketUrl ?? undefined,
        eventUrl: td.eventUrl ?? undefined,
        soldOut: td.soldOut ?? false
      });
    }

    for (const { id, changes } of tdDiff.updated) {
      const hasChanges =
        changes.date !== undefined ||
        changes.doorsTime !== undefined ||
        changes.title !== undefined ||
        changes.venue !== undefined ||
        changes.lineup !== undefined ||
        changes.imageUrl !== undefined ||
        changes.ticketUrl !== undefined ||
        changes.eventUrl !== undefined ||
        changes.soldOut !== undefined;
      if (hasChanges) {
        await serverUpdateShow({
          id,
          date: changes.date,
          doorsTime: changes.doorsTime,
          title: changes.title,
          venue: changes.venue,
          lineup: changes.lineup ?? undefined,
          imageUrl: changes.imageUrl,
          ticketUrl: changes.ticketUrl,
          eventUrl: changes.eventUrl,
          soldOut: changes.soldOut ?? undefined
        });
      }
    }
  }

  // --- Releases ---
  //
  // Updates only. Creating a release has to happen server-side before its
  // editor can be opened at a URL, and deleting one navigates away — neither
  // is something you stage and then commit.
  if (draft.hasChanges('releases')) {
    const releaseDiff = draft.computeCollectionDiff<ReleaseDraft>('releases');

    for (const { id, changes } of releaseDiff.updated) {
      // pageId is carried in the draft row so the editor can stay ignorant of
      // the two-table split; it is never something the editor changes.
      const { pageId: _pageId, ...fields } = changes;
      if (Object.keys(fields).length === 0) continue;
      await serverUpdateRelease({ id, ...fields });
    }
  }

  // --- Appearance ---
  if (draft.hasChanges('appearance')) {
    await updateAppearance(draftData.appearance);
  }
}
