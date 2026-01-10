import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { media } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Validation Schemas
// ============================================================================

const addMediaSchema = v.object({
	filename: v.string(),
	url: v.string(),
	thumbnailUrl: v.optional(v.string()),
	mimeType: v.string(),
	width: v.optional(v.number()),
	height: v.optional(v.number()),
	size: v.optional(v.number()),
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
			thumbnailUrl: data.thumbnailUrl,
			mimeType: data.mimeType,
			width: data.width,
			height: data.height,
			size: data.size,
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

		// Try to delete the main file
		try {
			const filePath = join('static', item.url);
			await unlink(filePath);
		} catch {
			// File might not exist, ignore
		}

		// Try to delete the thumbnail file
		if (item.thumbnailUrl) {
			try {
				const thumbPath = join('static', item.thumbnailUrl);
				await unlink(thumbPath);
			} catch {
				// Thumbnail might not exist, ignore
			}
		}
	}

	return { success: true };
});
