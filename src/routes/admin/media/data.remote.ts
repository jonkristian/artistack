import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { media, pressKit } from '$lib/server/schema';
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

		// Also remove from press kit if present
		await db.delete(pressKit).where(eq(pressKit.mediaId, id));

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
// Press Kit Commands
// ============================================================================

const addToPressKitSchema = v.object({
	mediaId: v.number()
});

const removeFromPressKitSchema = v.number(); // pressKit id

const reorderPressKitSchema = v.array(v.object({
	id: v.number(),
	position: v.number()
}));

export const addToPressKit = command(addToPressKitSchema, async ({ mediaId }) => {
	// Check if already in press kit
	const existing = await db
		.select()
		.from(pressKit)
		.where(eq(pressKit.mediaId, mediaId))
		.limit(1);

	if (existing.length > 0) {
		return { success: false, message: 'Already in press kit' };
	}

	// Get max position
	const [maxPos] = await db
		.select({ maxPosition: max(pressKit.position) })
		.from(pressKit);

	const position = (maxPos?.maxPosition ?? -1) + 1;

	const [created] = await db
		.insert(pressKit)
		.values({ mediaId, position })
		.returning();

	return { success: true, item: created };
});

export const removeFromPressKit = command(removeFromPressKitSchema, async (id) => {
	await db.delete(pressKit).where(eq(pressKit.id, id));
	return { success: true };
});

export const reorderPressKit = command(reorderPressKitSchema, async (items) => {
	for (const item of items) {
		await db
			.update(pressKit)
			.set({ position: item.position })
			.where(eq(pressKit.id, item.id));
	}
	return { success: true };
});
