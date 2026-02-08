import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { media, blocks, settings } from '$lib/server/schema';
import type { GalleryBlockConfig } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
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

  const [updated] = await db.update(media).set(updateData).where(eq(media.id, id)).returning();

  return { success: true, media: updated };
});

export const deleteMedia = command(deleteMediaSchema, async (id) => {
  // Get the media item first to get the file paths
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);

  if (item) {
    // Delete from database
    await db.delete(media).where(eq(media.id, id));

    // Also remove from any gallery block configs that reference this media
    const galleryBlocks = await db.select().from(blocks).where(eq(blocks.type, 'gallery'));
    for (const block of galleryBlocks) {
      const config = block.config as GalleryBlockConfig | null;
      if (config?.mediaIds?.includes(id)) {
        const updatedIds = config.mediaIds.filter((mid) => mid !== id);
        await db
          .update(blocks)
          .set({ config: { ...config, mediaIds: updatedIds } })
          .where(eq(blocks.id, block.id));
      }
    }

    // Also remove from press kit media IDs in settings
    const [s] = await db.select().from(settings).limit(1);
    if (s) {
      const pressKitIds = (s.pressKitMediaIds ?? []) as number[];
      if (pressKitIds.includes(id)) {
        await db
          .update(settings)
          .set({ pressKitMediaIds: pressKitIds.filter((mid) => mid !== id) })
          .where(eq(settings.id, s.id));
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
// Press Kit Commands (stored in settings.pressKitMediaIds)
// ============================================================================

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(settings).values({}).returning();
  return created;
}

export const addToPressKit = command(v.object({ mediaId: v.number() }), async ({ mediaId }) => {
  const s = await getOrCreateSettings();
  const ids = (s.pressKitMediaIds ?? []) as number[];

  if (ids.includes(mediaId)) {
    return { success: false, message: 'Already in press kit' };
  }

  await db
    .update(settings)
    .set({ pressKitMediaIds: [...ids, mediaId] })
    .where(eq(settings.id, s.id));

  return { success: true };
});

export const removeFromPressKit = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    const s = await getOrCreateSettings();
    const ids = (s.pressKitMediaIds ?? []) as number[];

    await db
      .update(settings)
      .set({ pressKitMediaIds: ids.filter((id) => id !== mediaId) })
      .where(eq(settings.id, s.id));

    return { success: true };
  }
);
