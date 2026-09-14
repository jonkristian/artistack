import {
  getSettings,
  getClipSettings,
  updateSiteSettings,
  updateClipSettings
} from '$lib/server/settings';
import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import {
  media,
  blocks,
  settings,
  clipSources,
  clipAudio,
  clipMedia,
  roleForMime
} from '$lib/server/schema';
import type { GalleryBlockConfig } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { isMediaUrl, removeMediaFile } from '$lib/server/paths';
import { queuePreviewRendition, removePreview } from '$lib/server/media-preview';
import { queueWaveform, removeWaveform } from '$lib/server/media-waveform';
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

/**
 * A URL the app is allowed to store, and therefore later to delete.
 *
 * These arrive from the browser — the admin uploads a file, then registers the
 * result — so the shape has to be checked here rather than assumed from the
 * upload route that produced it. Without this, a crafted `addMedia` followed by
 * `deleteMedia` unlinked whatever path the row named.
 */
const mediaUrl = v.pipe(v.string(), v.check(isMediaUrl, 'That is not a file this site uploaded.'));

const addMediaSchema = v.object({
  filename: v.string(),
  url: mediaUrl,
  originalUrl: v.optional(mediaUrl),
  thumbnailUrl: v.optional(mediaUrl),
  mimeType: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  size: v.optional(v.number()),
  originalSize: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  alt: v.optional(v.string()),
  /** Omitted for ordinary uploads, which take the role implied by their type. */
  role: v.optional(v.picklist(['asset', 'source', 'music', 'render', 'crop'])),
  /** Set on a crop: the library item it was taken from. */
  sourceMediaId: v.optional(v.number()),
  /** Set on a crop: the frame it was taken in, so Edit can restore it. */
  cropShape: v.optional(v.string())
});

const updateMediaSchema = v.object({
  id: v.number(),
  alt: v.optional(v.string()),
  url: v.optional(mediaUrl) // For re-cropped images
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
      sourceMediaId: data.sourceMediaId,
      cropShape: data.cropShape,
      alt: data.alt
    })
    .returning();

  // Quietly, after the fact: the row is usable now and everything that reads a
  // preview falls back to the original until this lands.
  queuePreviewRendition(created.id);
  queueWaveform(created.id);

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

/** Removes a row's files from disk. Missing files are not an error. */
async function unlinkMediaFiles(item: typeof media.$inferSelect) {
  for (const url of [item.url, item.originalUrl, item.thumbnailUrl]) {
    await removeMediaFile(url);
  }
}

export const deleteMedia = command(deleteMediaSchema, async (id) => {
  await requireUser();

  // Get the media item first to get the file paths
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);

  if (item) {
    /*
     * Crops of this picture go with it. They only exist as versions of it, and
     * without the source there's nothing to re-crop from — so leaving them
     * behind leaves files nothing can reach and nothing can edit.
     */
    const derivatives = await db.select().from(media).where(eq(media.sourceMediaId, id));
    for (const crop of derivatives) {
      await unlinkMediaFiles(crop);
    }
    if (derivatives.length) {
      await db.delete(media).where(eq(media.sourceMediaId, id));
    }
    // taggings has no foreign key, so it is cleaned up explicitly.
    await clearTags('media', id);
    await db.delete(media).where(eq(media.id, id));
    await pruneOrphanTags();

    // Drop any clip that used this as a source or a bed. Left in place, the row
    // would survive as a dangling reference and surface much later as a failed
    // render — "Source clip N is missing from the media library" — rather than
    // at the moment the file was removed.
    await db.delete(clipSources).where(eq(clipSources.mediaId, id));
    await db.delete(clipAudio).where(eq(clipAudio.mediaId, id));
    // The pool as well, or a clip keeps offering a file that isn't there.
    await db.delete(clipMedia).where(eq(clipMedia.mediaId, id));

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

    // Also drop it from the press kit selection
    const current = await getSettings();
    if (current) {
      const pressKitIds = current.pressKitMediaIds ?? [];
      if (pressKitIds.includes(id)) {
        await updateSiteSettings({ pressKitMediaIds: pressKitIds.filter((mid) => mid !== id) });
      }
    }

    await removePreview(item.previewUrl);
    await removeWaveform(item.waveformUrl);
    await unlinkMediaFiles(item);
  }

  return { success: true };
});

// ============================================================================
// Press Kit Commands (stored on the site's own settings)
// ============================================================================

export const addToPressKit = command(v.object({ mediaId: v.number() }), async ({ mediaId }) => {
  await requireUser();
  const current = await getSettings();
  const ids = current.pressKitMediaIds ?? [];

  if (ids.includes(mediaId)) {
    return { success: false, message: 'Already in press kit' };
  }

  await updateSiteSettings({ pressKitMediaIds: [...ids, mediaId] });

  return { success: true };
});

export const removeFromPressKit = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    await requireUser();
    const current = await getSettings();
    const ids = current.pressKitMediaIds ?? [];

    await updateSiteSettings({ pressKitMediaIds: ids.filter((id) => id !== mediaId) });

    return { success: true };
  }
);

// ============================================================================
// Clip Graphics (stored with the rest of the clip studio's settings)
// ============================================================================

/**
 * Designating a graphic is a pointer, not a move: the image stays an ordinary
 * library file and keeps its role, exactly like the press kit. The first one
 * designated becomes the default, so marking a logo is enough to start using it.
 */
export const addToClipGraphics = command(v.object({ mediaId: v.number() }), async ({ mediaId }) => {
  await requireUser();

  const s = (await getClipSettings()) ?? { graphicsMediaIds: [], defaultGraphicMediaId: null };
  const ids = (s.graphicsMediaIds ?? []) as number[];

  if (ids.includes(mediaId)) {
    return { success: false, message: 'Already a clip graphic' };
  }

  await updateClipSettings({
    graphicsMediaIds: [...ids, mediaId],
    ...(s.defaultGraphicMediaId ? {} : { defaultGraphicMediaId: mediaId })
  });

  return { success: true };
});

export const removeFromClipGraphics = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    await requireUser();

    const s = (await getClipSettings()) ?? { graphicsMediaIds: [], defaultGraphicMediaId: null };
    const ids = ((s.graphicsMediaIds ?? []) as number[]).filter((id) => id !== mediaId);

    await updateClipSettings({
      graphicsMediaIds: ids,
      // Never leave the default pointing at something no longer designated.
      ...(s.defaultGraphicMediaId === mediaId ? { defaultGraphicMediaId: ids[0] ?? null } : {})
    });

    return { success: true };
  }
);

export const setDefaultClipGraphic = command(
  v.object({ mediaId: v.number() }),
  async ({ mediaId }) => {
    await requireUser();

    const s = (await getClipSettings()) ?? { graphicsMediaIds: [], defaultGraphicMediaId: null };
    await updateClipSettings({ defaultGraphicMediaId: mediaId });
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
