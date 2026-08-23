import * as v from 'valibot';
import { command, query } from '$app/server';
import { db } from '$lib/server/db';
import { unlink } from 'fs/promises';
import { mediaPath } from '$lib/server/paths';
import { resolveTags, setTags, clearTags, pruneOrphanTags, listTags } from '$lib/server/tags';
import {
  clipProjects,
  clipSources,
  renderJobs,
  uploadSessions,
  media,
  settings,
  taggings,
  DEFAULT_CLIP_CONFIG,
  type ClipRenderConfig
} from '$lib/server/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { enqueueRender, cancelRender } from '$lib/server/render-queue';
import { buildPostSheet } from '$lib/server/post-sheet';
import {
  submitForReview,
  setReviewOutcome,
  ensurePreviewToken,
  rotatePreviewToken,
  previewUrl
} from '$lib/server/clip-review';
import { enqueueForRelease, dequeue, publishClip } from '$lib/server/clip-queue';

const timedCaptionSchema = v.object({
  start: v.number(),
  end: v.number(),
  text: v.string(),
  headline: v.optional(v.boolean())
});

// Renderer internals. Bounds here only reject values that would break a render;
// judgement about what looks good is left to the caller.
const advancedSchema = v.partial(
  v.object({
    fps: v.pipe(v.number(), v.minValue(1), v.maxValue(120)),
    crf: v.pipe(v.number(), v.minValue(0), v.maxValue(51)),
    maxrateMbps: v.pipe(v.number(), v.minValue(0.1)),
    audioBitrateKbps: v.pipe(v.number(), v.minValue(32)),
    preset: v.picklist(['ultrafast', 'veryfast', 'faster', 'fast', 'medium', 'slow']),

    loudnormTarget: v.number(),
    loudnormTruePeak: v.number(),
    loudnormRange: v.pipe(v.number(), v.minValue(1)),
    loudnormFloor: v.number(),
    musicBedVolume: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),

    introPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    introMinSeconds: v.pipe(v.number(), v.minValue(0)),
    introMaxSeconds: v.pipe(v.number(), v.minValue(0)),
    introFallbackSeconds: v.pipe(v.number(), v.minValue(0)),
    outroSeconds: v.pipe(v.number(), v.minValue(0)),
    outroOverlapSeconds: v.pipe(v.number(), v.minValue(0)),
    cardBackground: v.string(),

    logoWidthPercent: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
    watermarkWidthPercent: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
    watermarkX: v.number(),
    watermarkY: v.number(),

    captionSizeDivisor: v.pipe(v.number(), v.minValue(1)),
    headlineSizeDivisor: v.pipe(v.number(), v.minValue(1)),
    captionMarginX: v.pipe(v.number(), v.minValue(0)),
    fontFamily: v.string(),

    blurStrength: v.pipe(v.number(), v.minValue(0)),
    grainStrength: v.pipe(v.number(), v.minValue(0)),
    zoomRate: v.pipe(v.number(), v.minValue(0)),
    zoomMax: v.pipe(v.number(), v.minValue(1)),
    xfadeSeconds: v.pipe(v.number(), v.minValue(0)),
    edgeFillPixels: v.pipe(v.number(), v.minValue(0)),

    videoFadeOutSeconds: v.pipe(v.number(), v.minValue(0)),
    audioFadeInSeconds: v.pipe(v.number(), v.minValue(0)),
    audioFadeOutSeconds: v.pipe(v.number(), v.minValue(0)),

    coverLumaThreshold: v.pipe(v.number(), v.minValue(0), v.maxValue(255))
  })
);

// Config is stored as a partial and merged with defaults at render time, so an
// older project keeps working when new options are added.
const configSchema = v.partial(
  v.object({
    aspect: v.picklist(['9:16', '1:1', '16:9']),
    captionPosition: v.picklist(['top', 'center', 'bottom']),
    colorizeCaption: v.boolean(),
    captionBackground: v.boolean(),
    fill: v.picklist(['blur', 'black', 'crop']),
    tone: v.picklist(['none', 'bw', 'warm', 'cool', 'vintage']),
    grain: v.boolean(),
    vignette: v.boolean(),
    zoom: v.boolean(),
    xfade: v.boolean(),
    speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(2)),
    videoFadeOut: v.boolean(),
    audioFadeIn: v.boolean(),
    audioFadeOut: v.boolean(),
    intro: v.boolean(),
    outro: v.boolean(),
    watermark: v.boolean(),
    graphicMediaId: v.nullable(v.number()),
    randomGraphics: v.boolean(),
    logoMediaId: v.nullable(v.number()),
    logoColor: v.nullable(v.string()),
    loudnorm: v.boolean(),
    musicMediaId: v.nullable(v.number()),
    musicFadeIn: v.pipe(v.number(), v.minValue(0)),
    musicFadeOut: v.pipe(v.number(), v.minValue(0)),
    musicStart: v.pipe(v.number(), v.minValue(0)),
    musicSeek: v.pipe(v.number(), v.minValue(0)),
    musicCrossfade: v.nullable(v.number()),
    musicOnly: v.boolean(),
    duck: v.boolean(),
    advanced: advancedSchema
  })
);

/** Every known tag, for the tag input's autocomplete. */
export const getTags = query(async () => listTags());

export const createProject = command(v.object({ name: v.string() }), async ({ name }) => {
  // Seeded with whatever boilerplate was last saved as the default, so the
  // hashtags and call to action every post shares are already there.
  const [siteSettings] = await db.select().from(settings).limit(1);

  const [created] = await db
    .insert(clipProjects)
    .values({
      name: name.trim() || 'Untitled clip',
      description: siteSettings?.clipDefaultDescription ?? null,
      config: { ...DEFAULT_CLIP_CONFIG }
    })
    .returning();

  const defaultTagIds = siteSettings?.clipDefaultTagIds ?? [];
  if (defaultTagIds.length) {
    await db
      .insert(taggings)
      .values(
        defaultTagIds.map((tagId) => ({ tagId, entityType: 'clip' as const, entityId: created.id }))
      );
  }

  return { success: true, project: created };
});

/*
 * The boilerplate new clips start with. Split per field rather than one command
 * taking both, because the buttons are per-field: saving your tags shouldn't
 * quietly capture a description you were still drafting. Each save replaces the
 * previous — no history, just the current boilerplate.
 */
export const saveClipDefaultDescription = command(v.string(), async (value) => {
  const stored = value.trim() || null;
  const [existing] = await db.select({ id: settings.id }).from(settings).limit(1);
  if (!existing) return { success: false, message: 'No settings row' };

  await db
    .update(settings)
    .set({ clipDefaultDescription: stored })
    .where(eq(settings.id, existing.id));

  return { success: true, cleared: stored === null };
});

/** Stored as ids so a renamed tag stays the default it was. */
export const saveClipDefaultTags = command(v.array(v.string()), async (names) => {
  const [existing] = await db.select({ id: settings.id }).from(settings).limit(1);
  if (!existing) return { success: false, message: 'No settings row' };

  const tagIds = await resolveTags(names);
  await db.update(settings).set({ clipDefaultTagIds: tagIds }).where(eq(settings.id, existing.id));

  return { success: true, cleared: tagIds.length === 0 };
});

export const updateProject = command(
  v.object({
    id: v.number(),
    name: v.optional(v.string()),
    description: v.optional(v.nullable(v.string())),
    tags: v.optional(v.array(v.string())),
    captions: v.optional(v.array(timedCaptionSchema)),
    config: v.optional(configSchema)
  }),
  async ({ id, config, tags: tagNames, ...fields }) => {
    const [existing] = await db.select().from(clipProjects).where(eq(clipProjects.id, id)).limit(1);
    if (!existing) return { success: false, message: 'Project not found' };

    // Tags live in their own table, so they're replaced separately from the row.
    if (tagNames !== undefined) {
      await setTags('clip', id, tagNames);
      await pruneOrphanTags();
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }

    // Merge rather than replace: the UI sends only the fields it changed.
    // `advanced` needs its own merge — a shallow spread would swap the whole
    // block out and silently reset every dial the caller didn't mention.
    if (config) {
      const { advanced, ...rest } = config;
      const previous: Partial<ClipRenderConfig> = existing.config ?? {};
      update.config = {
        ...DEFAULT_CLIP_CONFIG,
        ...previous,
        ...rest,
        ...(advanced ? { advanced: { ...(previous.advanced ?? {}), ...advanced } } : {})
      };
    }

    const [updated] = await db
      .update(clipProjects)
      .set(update)
      .where(eq(clipProjects.id, id))
      .returning();

    return { success: true, project: updated };
  }
);

export const deleteProject = command(v.number(), async (id) => {
  const [project] = await db
    .select({ outputMediaId: clipProjects.outputMediaId })
    .from(clipProjects)
    .where(eq(clipProjects.id, id))
    .limit(1);

  await db.delete(clipSources).where(eq(clipSources.projectId, id));
  await db.delete(renderJobs).where(eq(renderJobs.projectId, id));
  // A phone-upload QR bound to this clip would otherwise stay valid until it
  // expired, and finalizeSessionUpload would keep filing sources against a
  // project that no longer exists.
  await db.delete(uploadSessions).where(eq(uploadSessions.projectId, id));
  await clearTags('clip', id);
  await db.delete(clipProjects).where(eq(clipProjects.id, id));
  await pruneOrphanTags();

  // The render goes with the clip. There's no way to delete a render on its
  // own — a new one supersedes the old, and this removes the last — so leaving
  // it behind would strand a file nothing points at.
  if (project?.outputMediaId) await discardRender(project.outputMediaId);

  return { success: true };
});

/**
 * Deletes a clip's rendered video and its thumbnail.
 *
 * Only ever touches rows this app produced (`role: 'render'`) and only when no
 * other project still points at them, so a hand-picked asset that happened to
 * be set as an output can't be swept up. Never allowed to fail the delete.
 */
async function discardRender(mediaId: number): Promise<void> {
  try {
    const [item] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (!item || item.role !== 'render') return;

    const others = await db
      .select({ id: clipProjects.id })
      .from(clipProjects)
      .where(eq(clipProjects.outputMediaId, mediaId));
    if (others.length) return;

    await db.delete(media).where(eq(media.id, mediaId));
    for (const url of [item.url, item.thumbnailUrl]) {
      if (url) await unlink(mediaPath(url)).catch(() => {});
    }
  } catch (e) {
    console.error('[Clips] Could not discard render on delete:', e);
  }
}

export const addSource = command(
  v.object({ projectId: v.number(), mediaId: v.number() }),
  async ({ projectId, mediaId }) => {
    const existing = await db
      .select()
      .from(clipSources)
      .where(eq(clipSources.projectId, projectId));

    const [created] = await db
      .insert(clipSources)
      .values({
        projectId,
        mediaId,
        position: existing.reduce((max, s) => Math.max(max, s.position ?? 0), 0) + 1
      })
      .returning();

    return { success: true, source: created };
  }
);

export const updateSource = command(
  v.object({
    id: v.number(),
    trimStart: v.optional(v.nullable(v.number())),
    trimEnd: v.optional(v.nullable(v.number())),
    muted: v.optional(v.boolean()),
    watermark: v.optional(v.nullable(v.boolean()))
  }),
  async ({ id, ...fields }) => {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (Object.keys(update).length === 0) return { success: true };

    await db.update(clipSources).set(update).where(eq(clipSources.id, id));
    return { success: true };
  }
);

export const removeSource = command(v.number(), async (id) => {
  await db.delete(clipSources).where(eq(clipSources.id, id));
  return { success: true };
});

export const reorderSources = command(
  v.object({ projectId: v.number(), orderedIds: v.array(v.number()) }),
  async ({ projectId, orderedIds }) => {
    // Positions are rewritten from the given order, so a partial or stale list
    // can't leave two sources fighting over the same slot.
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(clipSources)
        .set({ position: i + 1 })
        .where(eq(clipSources.id, orderedIds[i]));
    }
    await db
      .update(clipProjects)
      .set({ updatedAt: new Date() })
      .where(eq(clipProjects.id, projectId));

    return { success: true };
  }
);

export const startRender = command(v.number(), async (projectId) => {
  const sources = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, projectId))
    .orderBy(asc(clipSources.position));

  if (sources.length === 0) {
    return { success: false, message: 'Add at least one source clip first' };
  }

  const job = await enqueueRender(projectId);
  return { success: true, job };
});

export const stopRender = command(v.number(), async (jobId) => {
  const cancelled = await cancelRender(jobId);
  return { success: cancelled };
});

/** Polled by the UI while a render is in flight. */
export const getRenderStatus = query(v.number(), async (projectId) => {
  const [job] = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.projectId, projectId))
    .orderBy(desc(renderJobs.createdAt))
    .limit(1);

  return job ?? null;
});

export const sendForReview = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    return submitForReview(projectId, origin);
  }
);

export const reviewDecision = command(
  v.object({
    projectId: v.number(),
    approved: v.boolean(),
    note: v.optional(v.nullable(v.string()))
  }),
  async ({ projectId, approved, note }) => {
    const project = await setReviewOutcome(projectId, approved, note);
    return { success: true, project };
  }
);

export const createPreviewLink = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    const token = await ensurePreviewToken(projectId);
    return { success: true, url: previewUrl(origin, token) };
  }
);

export const resetPreviewLink = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    const token = await rotatePreviewToken(projectId);
    return { success: true, url: previewUrl(origin, token) };
  }
);

export const addToQueue = command(v.number(), async (projectId) => {
  return enqueueForRelease(projectId);
});

export const removeFromQueue = command(v.number(), async (projectId) => {
  await dequeue(projectId);
  return { success: true };
});

export const setQueueGap = command(
  v.object({ projectId: v.number(), days: v.nullable(v.number()) }),
  async ({ projectId, days }) => {
    await db
      .update(clipProjects)
      .set({ queueGapDays: days, updatedAt: new Date() })
      .where(eq(clipProjects.id, projectId));
    return { success: true };
  }
);

/** Releases a clip immediately, ahead of its slot. */
export const publishNow = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    return publishClip(projectId, origin);
  }
);

export const getPostSheet = query(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    return buildPostSheet(projectId, origin);
  }
);
