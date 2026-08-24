import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { media, blocks, settings, clipSources, roleForMime } from '$lib/server/schema';
import type { GalleryBlockConfig } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { mediaPath } from '$lib/server/paths';
import { setTags, clearTags, pruneOrphanTags } from '$lib/server/tags';

/** Where the clip studio caches its preset swatches, keyed `<mediaId>-<preset>.jpg`. */
const PRESET_PREVIEW_DIR = 'data/uploads/.preset-previews';

/**
 * Removes the cached preset swatches generated from one source file.
 * Best-effort: a stale image left behind is cosmetic, and must never be the
 * reason a delete fails.
 */
async function removePresetPreviews(mediaId: number): Promise<void> {
  try {
    const entries = await readdir(PRESET_PREVIEW_DIR);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(`${mediaId}-`))
        .map((name) => unlink(join(PRESET_PREVIEW_DIR, name)).catch(() => {}))
    );
  } catch {
    // Directory won't exist until the first swatch is generated.
  }
}

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
  durationMs: v.optional(v.number()),
  alt: v.optional(v.string()),
  /** Omitted for ordinary uploads, which take the role implied by their type. */
  role: v.optional(v.picklist(['asset', 'source', 'music', 'render']))
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
  await requireUser();

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
      durationMs: data.durationMs,
      role: data.role ?? roleForMime(data.mimeType),
      alt: data.alt
    })
    .returning();

  return { success: true, media: created };
});

export const updateMedia = command(updateMediaSchema, async ({ id, alt, url }) => {
  await requireUser();

  const updateData: Record<string, unknown> = {};
  if (alt !== undefined) updateData.alt = alt;
  if (url !== undefined) updateData.url = url;

  const [updated] = await db.update(media).set(updateData).where(eq(media.id, id)).returning();

  return { success: true, media: updated };
});

export const deleteMedia = command(deleteMediaSchema, async (id) => {
  await requireUser();

  // Get the media item first to get the file paths
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);

  if (item) {
    // taggings has no foreign key, so it is cleaned up explicitly.
    await clearTags('media', id);
    await db.delete(media).where(eq(media.id, id));
    await pruneOrphanTags();

    // Drop any clip that used this as a source. Left in place, the row would
    // survive as a dangling reference and surface much later as a failed
    // render — "Source clip N is missing from the media library" — rather than
    // at the moment the file was removed.
    await db.delete(clipSources).where(eq(clipSources.mediaId, id));

    // Preset swatches are cached per source file, so they go with it.
    await removePresetPreviews(id);

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
      const filePath = mediaPath(item.url);
      await unlink(filePath);
    } catch {
      // File might not exist, ignore
    }

    // Try to delete the original file
    if (item.originalUrl) {
      try {
        const originalPath = mediaPath(item.originalUrl);
        await unlink(originalPath);
      } catch {
        // Original might not exist, ignore
      }
    }

    // Try to delete the thumbnail file
    if (item.thumbnailUrl) {
      try {
        const thumbPath = mediaPath(item.thumbnailUrl);
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
  await requireUser();

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
    await requireUser();

    const s = await getOrCreateSettings();
    const ids = (s.pressKitMediaIds ?? []) as number[];

    await db
      .update(settings)
      .set({ pressKitMediaIds: ids.filter((id) => id !== mediaId) })
      .where(eq(settings.id, s.id));

    return { success: true };
  }
);

// ============================================================================
// Clip Graphics (stored in settings.clipGraphicsMediaIds)
// ============================================================================

/**
 * Designating a graphic is a pointer, not a move: the image stays an ordinary
 * library file and keeps its role, exactly like the press kit. The first one
 * designated becomes the default, so marking a logo is enough to start using it.
 */
export const addToClipGraphics = command(v.object({ mediaId: v.number() }), async ({ mediaId }) => {
  await requireUser();

  const s = await getOrCreateSettings();
  const ids = (s.clipGraphicsMediaIds ?? []) as number[];

  if (ids.includes(mediaId)) {
    return { success: false, message: 'Already a clip graphic' };
  }

  await db
    .update(settings)
    .set({
      clipGraphicsMediaIds: [...ids, mediaId],
      ...(s.defaultClipGraphicMediaId ? {} : { defaultClipGraphicMediaId: mediaId })
    })
    .where(eq(settings.id, s.id));

  return { success: true };
});

export const removeFromClipGraphics = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    await requireUser();

    const s = await getOrCreateSettings();
    const ids = ((s.clipGraphicsMediaIds ?? []) as number[]).filter((id) => id !== mediaId);

    await db
      .update(settings)
      .set({
        clipGraphicsMediaIds: ids,
        // Never leave the default pointing at something no longer designated.
        ...(s.defaultClipGraphicMediaId === mediaId
          ? { defaultClipGraphicMediaId: ids[0] ?? null }
          : {})
      })
      .where(eq(settings.id, s.id));

    return { success: true };
  }
);

export const setDefaultClipGraphic = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    await requireUser();

    const s = await getOrCreateSettings();
    await db
      .update(settings)
      .set({ defaultClipGraphicMediaId: mediaId })
      .where(eq(settings.id, s.id));
    return { success: true };
  }
);

/** Replaces the tags on one media file. */
export const setMediaTags = command(
  v.object({ id: v.number(), tags: v.array(v.string()) }),
  async ({ id, tags }) => {
    await requireUser();

    await setTags('media', id, tags);
    await pruneOrphanTags();
    return { success: true };
  }
);
