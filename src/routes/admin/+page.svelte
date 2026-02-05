<script lang="ts">
	import { SortableBlockList, LayoutPreview } from '$lib/components/ui';
	import { LinkEditDialog, TourDateEditDialog } from '$lib/components/dialogs';
	import { blockRegistry } from '$lib/blocks';
	import BlockAdminWrapper from '$lib/blocks/BlockAdminWrapper.svelte';
	import BlockPicker from '$lib/blocks/BlockPicker.svelte';
	import Default from '$lib/themes/Default.svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import * as draft from '$lib/stores/pageDraft.svelte';
	import { registerSaveHandler, clearSaveHandler } from '$lib/stores/pendingChanges.svelte';
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
		updateProfileImage as serverUpdateProfileImage
	} from './data.remote';

	let { data }: { data: PageData } = $props();

	// Initialize draft store once at component creation (no $effect needed)
	draft.initialize({
		profile: data.profile ?? { id: 1, name: 'Artist Name' },
		blocks: data.blocks ?? [],
		links: data.links ?? [],
		tourDates: data.tourDates ?? []
	});

	// Get reactive draft data - components modify this directly
	const draftData = draft.getData<{
		profile: Profile;
		blocks: Block[];
		links: Link[];
		tourDates: TourDate[];
	}>();

	// Register save handler - persists all changes
	registerSaveHandler(async () => {
		// Save profile changes
		const profileChanges = draft.computeObjectDiff<Profile>('profile');
		if (profileChanges) {
			// Handle image changes separately
			if (profileChanges.logoUrl !== undefined || profileChanges.logoShape !== undefined) {
				await serverUpdateProfileImage({
					type: 'logo',
					url: draftData.profile.logoUrl ?? null,
					shape: draftData.profile.logoShape as any
				});
			}
			if (profileChanges.photoUrl !== undefined || profileChanges.photoShape !== undefined) {
				await serverUpdateProfileImage({
					type: 'photo',
					url: draftData.profile.photoUrl ?? null,
					shape: draftData.profile.photoShape as any
				});
			}
			if (profileChanges.backgroundUrl !== undefined) {
				await serverUpdateProfileImage({
					type: 'background',
					url: draftData.profile.backgroundUrl ?? null
				});
			}
			// Handle text fields
			if (profileChanges.name !== undefined || profileChanges.bio !== undefined || profileChanges.email !== undefined) {
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
				type: block.type as 'profile' | 'links' | 'tour_dates' | 'images',
				label: block.label ?? undefined,
				config: block.config ?? undefined
			});
			blockIdMap.set(block.id, result.block.id);
		}
		for (const { id, changes } of blockDiff.updated) {
			await serverUpdateBlock({
				id,
				label: changes.label ?? undefined,
				config: changes.config,
				visible: changes.visible ?? undefined
			});
		}
		if (blockDiff.reordered) {
			const existingBlocks = draftData.blocks.filter(b => b.id > 0);
			await serverReorderBlocks(existingBlocks.map((b, i) => ({ id: b.id, position: i })));
		}

		// Process links
		const linkDiff = draft.computeCollectionDiff<Link>('links');
		for (const id of linkDiff.deleted) {
			await serverDeleteLink(id);
		}
		for (const link of linkDiff.added) {
			const blockId = link.blockId < 0 ? blockIdMap.get(link.blockId) ?? link.blockId : link.blockId;
			await serverCreateLink({
				blockId,
				url: link.url,
				category: link.category as 'social' | 'streaming' | 'merch' | 'other'
			});
		}
		for (const { id, changes } of linkDiff.updated) {
			await serverUpdateLink({
				id,
				label: changes.label,
				url: changes.url,
				embedData: changes.embedData
			});
		}
		// Reorder links per block
		const blockIds = new Set(draftData.links.filter(l => l.id > 0).map(l => l.blockId));
		for (const blockId of blockIds) {
			const blockLinks = draftData.links.filter(l => l.blockId === blockId && l.id > 0);
			await serverReorderLinks(blockLinks.map((l, i) => ({ id: l.id, position: i })));
		}

		// Process tour dates
		const tdDiff = draft.computeCollectionDiff<TourDate>('tourDates');
		for (const id of tdDiff.deleted) {
			await serverDeleteTourDate(id);
		}
		for (const td of tdDiff.added) {
			const blockId = td.blockId < 0 ? blockIdMap.get(td.blockId) ?? td.blockId : td.blockId;
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

		// Refresh data from server and re-initialize draft with real IDs
		await invalidateAll();
		draft.initialize({
			profile: data.profile ?? { id: 1, name: 'Artist Name' },
			blocks: data.blocks ?? [],
			links: data.links ?? [],
			tourDates: data.tourDates ?? []
		});
	});

	onDestroy(() => {
		clearSaveHandler();
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
		bg: data.settings?.colorBg ?? '#0f0f0f',
		card: data.settings?.colorCard ?? '#1a1a1a',
		accent: data.settings?.colorAccent ?? '#8b5cf6'
	});

	// Block picker
	let blockPickerEl: BlockPicker;

	// ===== Block operations =====
	function handleAddBlock(type: string) {
		const def = blockRegistry[type];
		if (!def) return;

		const newBlock: Block = {
			id: draft.getTempId(),
			type: type,
			label: def.defaultLabel,
			config: def.defaultConfig,
			visible: true,
			position: draftData.blocks.length,
			createdAt: new Date()
		};
		draftData.blocks = [...draftData.blocks, newBlock];
		toast.info(`${def.name} block added`);
	}

	function handleDeleteBlock(id: number) {
		if (!confirm('Delete this block?')) return;
		draftData.blocks = draftData.blocks.filter(b => b.id !== id);
		draftData.links = draftData.links.filter(l => l.blockId !== id);
		draftData.tourDates = draftData.tourDates.filter(t => t.blockId !== id);
	}

	function handleToggleVisibility(id: number, visible: boolean) {
		const block = draftData.blocks.find(b => b.id === id);
		if (block) block.visible = visible;
	}

	function handleUpdateLabel(id: number, label: string) {
		const block = draftData.blocks.find(b => b.id === id);
		if (block) block.label = label;
	}

	function handleReorderBlocks(items: Block[]) {
		draftData.blocks = items.map((item, i) => ({ ...item, position: i }));
	}
</script>

<div class="flex h-screen">
	<!-- Left Column: Edit Controls -->
	<div class="w-1/2 overflow-y-auto bg-gray-950 p-6">
		<div class="space-y-4">
			{#if draftData.blocks?.length > 0}
				<SortableBlockList items={draftData.blocks} onreorder={handleReorderBlocks}>
					{#snippet children(block)}
						{@const def = blockRegistry[block.type]}
					{#if def?.adminSettingsComponent}
						<BlockAdminWrapper
							{block}
							ondelete={handleDeleteBlock}
							ontogglevisibility={handleToggleVisibility}
							onupdatelabel={handleUpdateLabel}
						>
							{#snippet settings()}
								<svelte:component this={def.adminSettingsComponent} {block} />
							{/snippet}
							<svelte:component
								this={def.adminComponent}
								{block}
								profile={draftData.profile}
								links={draftData.links}
								tourDates={draftData.tourDates}
								media={data.media}
								oneditlink={openLinkDialog}
								onedittourdate={(t: TourDate) => openTourDateDialog(t)}
								onaddtourdate={(blockId: number) => openTourDateDialog('new', blockId)}
							/>
						</BlockAdminWrapper>
					{:else if def}
						<BlockAdminWrapper
							{block}
							ondelete={handleDeleteBlock}
							ontogglevisibility={handleToggleVisibility}
							onupdatelabel={handleUpdateLabel}
						>
							<svelte:component
								this={def.adminComponent}
								{block}
								profile={draftData.profile}
								links={draftData.links}
								tourDates={draftData.tourDates}
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

			<!-- Add Block Button -->
			<button
				onclick={() => blockPickerEl?.open()}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Block
			</button>
		</div>
	</div>

	<!-- Right Column: Live Preview -->
	<div class="w-1/2 overflow-y-auto border-l border-gray-800" style="background-color: {data.settings?.colorBg ?? '#0f0f0f'}">
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

<!-- Block Picker Dialog -->
<BlockPicker
	bind:this={blockPickerEl}
	onselect={handleAddBlock}
	onclose={() => {}}
/>

<!-- Link Edit Dialog -->
<LinkEditDialog link={editingLink} links={draftData.links} {themeColors} onclose={closeLinkDialog} />

<!-- Tour Date Edit Dialog -->
<TourDateEditDialog
	tourDate={editingTourDate}
	tourDates={draftData.tourDates}
	blockId={editingTourDateBlockId}
	googleApiKey={data.googleConfig?.placesEnabled ? data.googleConfig.apiKey : null}
	onclose={closeTourDateDialog}
/>
