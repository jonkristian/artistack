import * as draft from '$lib/stores/pageDraft.svelte';
import type { Profile, Block, Link, TourDate } from '$lib/server/schema';
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
  saveProfile as serverSaveProfile
} from './data.remote';
import { updateAppearance } from './appearance/data.remote';

// ===== Types =====

export type AppearanceData = {
  colorBg: string;
  colorCard: string;
  colorAccent: string;
  colorText: string;
  colorTextMuted: string;
  layout: 'default' | 'minimal' | 'card';
  showShareButton: boolean;
  showPressKit: boolean;
};

export type UnifiedDraftData = {
  profile: Profile;
  blocks: Block[];
  links: Link[];
  tourDates: TourDate[];
  appearance: AppearanceData;
};

// ===== Helpers =====

/**
 * Build draft data from server layout data.
 * Single source of truth for mapping server data → draft shape.
 */
export function buildDraftFromServerData(data: {
  profile: Profile | null;
  blocks: Block[];
  links: Link[];
  tourDates: TourDate[];
  settings: {
    colorBg?: string | null;
    colorCard?: string | null;
    colorAccent?: string | null;
    colorText?: string | null;
    colorTextMuted?: string | null;
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
    tourDates: data.tourDates ?? [],
    appearance: {
      colorBg: s?.colorBg ?? '#0c0a14',
      colorCard: s?.colorCard ?? '#14101f',
      colorAccent: s?.colorAccent ?? '#8b5cf6',
      colorText: s?.colorText ?? '#f4f4f5',
      colorTextMuted: s?.colorTextMuted ?? '#a1a1aa',
      layout: (s?.layout as 'default' | 'minimal' | 'card') ?? 'default',
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
      const result = await serverAddBlock({
        type: block.type as 'profile' | 'links' | 'tour_dates' | 'image' | 'gallery',
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
      const reorderData = draftData.blocks
        .map((b, i) => ({
          id: b.id < 0 ? (blockIdMap.get(b.id) ?? b.id) : b.id,
          position: i
        }))
        .filter((b) => b.id > 0);
      await serverReorderBlocks(reorderData);
    }
  }

  // --- Links ---
  if (draft.hasChanges('links')) {
    const linkDiff = draft.computeCollectionDiff<Link>('links');

    for (const id of linkDiff.deleted) {
      await serverDeleteLink(id);
    }

    for (const link of linkDiff.added) {
      const blockId =
        link.blockId < 0 ? (blockIdMap.get(link.blockId) ?? link.blockId) : link.blockId;
      await serverCreateLink({
        url: link.url,
        blockId,
        category: link.category as 'social' | 'streaming' | 'merch' | 'other',
        platform: link.platform,
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
      const blockLinks = draftData.links.filter((l) => l.blockId === blockId && l.id > 0);
      await serverReorderLinks(blockLinks.map((l, i) => ({ id: l.id, position: i })));
    }
  }

  // --- Tour Dates ---
  if (draft.hasChanges('tourDates')) {
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
  }

  // --- Appearance ---
  if (draft.hasChanges('appearance')) {
    await updateAppearance(draftData.appearance);
  }
}
