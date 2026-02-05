import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { media, blocks } from '$lib/server/schema';
import type { ImagesBlockConfig } from '$lib/server/schema';
import { eq, max } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Validation Schemas
// ============================================================================

const addMediaSchema = v.object({
	filename: v.string(),
	url: v.string(),
	originalUrl: v.optional(v.string()),
	thumbnailUrl: v.optional(v.string()),
	mimeType: v.string(),
	width: v.optional(v.number()),
	height: v.optional(v.number()),
	size: v.optional(v.number()),
	originalSize: v.optional(v.number()),
	alt: v.optional(v.string())
});

const updateMediaSchema = v.object({
	id: v.number(),
	alt: v.optional(v.string()),
	url: v.optional(v.string()) // For re-cropped images
});

const deleteMediaSchema = v.number();

// ============================================================================
// Media Commands
// ============================================================================

export const addMedia = command(addMediaSchema, async (data) => {
	const [created] = await db
		.insert(media)
		.values({
			filename: data.filename,
			url: data.url,
			originalUrl: data.originalUrl,
			thumbnailUrl: data.thumbnailUrl,
			mimeType: data.mimeType,
			width: data.width,
			height: data.height,
			size: data.size,
			originalSize: data.originalSize,
			alt: data.alt
		})
		.returning();

	return { success: true, media: created };
});

export const updateMedia = command(updateMediaSchema, async ({ id, alt, url }) => {
	const updateData: Record<string, unknown> = {};
	if (alt !== undefined) updateData.alt = alt;
	if (url !== undefined) updateData.url = url;

	const [updated] = await db
		.update(media)
		.set(updateData)
		.where(eq(media.id, id))
		.returning();

	return { success: true, media: updated };
});

export const deleteMedia = command(deleteMediaSchema, async (id) => {
	// Get the media item first to get the file paths
	const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);

	if (item) {
		// Delete from database
		await db.delete(media).where(eq(media.id, id));

		// Also remove from any images block configs that reference this media
		const imageBlocks = await db.select().from(blocks).where(eq(blocks.type, 'images'));
		for (const block of imageBlocks) {
			const config = block.config as ImagesBlockConfig | null;
			if (config?.mediaIds?.includes(id)) {
				const updatedIds = config.mediaIds.filter((mid) => mid !== id);
				await db
					.update(blocks)
					.set({ config: { ...config, mediaIds: updatedIds } })
					.where(eq(blocks.id, block.id));
			}
		}

		// Try to delete the optimized file
		try {
			const filePath = join('data', item.url);
			await unlink(filePath);
		} catch {
			// File might not exist, ignore
		}

		// Try to delete the original file
		if (item.originalUrl) {
			try {
				const originalPath = join('data', item.originalUrl);
				await unlink(originalPath);
			} catch {
				// Original might not exist, ignore
			}
		}

		// Try to delete the thumbnail file
		if (item.thumbnailUrl) {
			try {
				const thumbPath = join('data', item.thumbnailUrl);
				await unlink(thumbPath);
			} catch {
				// Thumbnail might not exist, ignore
			}
		}
	}

	return { success: true };
});

// ============================================================================
// Press Kit Commands (using images block with displayAs: 'download')
// ============================================================================

const addToPressKitSchema = v.object({
	mediaId: v.number(),
	blockId: v.optional(v.nullable(v.number()))
});

const removeFromPressKitSchema = v.object({
	mediaId: v.number(),
	blockId: v.number()
});

async function getOrCreatePressKitBlock(blockId?: number | null): Promise<number> {
	// If a blockId is provided, use it
	if (blockId) return blockId;

	// Find existing download-type images block
	const imageBlocks = await db.select().from(blocks).where(eq(blocks.type, 'images'));
	const existing = imageBlocks.find((b) => {
		const config = b.config as ImagesBlockConfig | null;
		return config?.displayAs === 'download';
	});

	if (existing) return existing.id;

	// Create a new images block with download display
	const [maxPos] = await db
		.select({ maxPosition: max(blocks.position) })
		.from(blocks);

	const position = (maxPos?.maxPosition ?? -1) + 1;

	const [created] = await db
		.insert(blocks)
		.values({
			type: 'images',
			label: 'Press Kit',
			config: { displayAs: 'download', mediaIds: [] } satisfies ImagesBlockConfig,
			position
		})
		.returning();

	return created.id;
}

export const addToPressKit = command(addToPressKitSchema, async ({ mediaId, blockId }) => {
	const pressKitBlockId = await getOrCreatePressKitBlock(blockId);

	// Get current block config
	const [block] = await db.select().from(blocks).where(eq(blocks.id, pressKitBlockId)).limit(1);
	if (!block) return { success: false, message: 'Block not found' };

	const config = (block.config as ImagesBlockConfig) ?? { displayAs: 'download', mediaIds: [] };
	const mediaIds = config.mediaIds ?? [];

	// Check if already in press kit
	if (mediaIds.includes(mediaId)) {
		return { success: false, message: 'Already in press kit' };
	}

	// Add media to block config
	await db
		.update(blocks)
		.set({ config: { ...config, mediaIds: [...mediaIds, mediaId] } })
		.where(eq(blocks.id, pressKitBlockId));

	return { success: true, blockId: pressKitBlockId };
});

export const removeFromPressKit = command(removeFromPressKitSchema, async ({ mediaId, blockId }) => {
	const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
	if (!block) return { success: false };

	const config = (block.config as ImagesBlockConfig) ?? { displayAs: 'download', mediaIds: [] };
	const mediaIds = (config.mediaIds ?? []).filter((id) => id !== mediaId);

	await db
		.update(blocks)
		.set({ config: { ...config, mediaIds } })
		.where(eq(blocks.id, blockId));

	return { success: true };
});
