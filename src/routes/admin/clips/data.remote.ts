import { requireUser } from '$lib/server/guards';
import { getClipSettings, updateClipSettings } from '$lib/server/settings';
import * as v from 'valibot';
import { command, query } from '$app/server';
import { db } from '$lib/server/db';
import { unlink } from 'fs/promises';
import { mediaPath } from '$lib/server/paths';
import { rotateMedia } from '$lib/server/media-rotate';
import { resolveTags, setTags, clearTags, pruneOrphanTags, listTags } from '$lib/server/tags';
import {
  clipProjects,
  clipMedia,
  clipSources,
  clipAudio,
  clipPosts,
  renderJobs,
  uploadSessions,
  media,
  settings,
  taggings,
  DEFAULT_CLIP_CONFIG,
  type ClipRenderConfig
} from '$lib/server/schema';
import { CLIP_ROTATIONS } from '$lib/clips/types';
import { and, eq, asc, desc } from 'drizzle-orm';
import { enqueueRender, cancelRender } from '$lib/server/render-queue';
import { buildPostSheet } from '$lib/server/post-sheet';
import {
  submitForReview,
  ensurePreviewToken,
  rotatePreviewToken,
  previewUrl
} from '$lib/server/clip-review';
import { enqueueForRelease, dequeue, publishClip } from '$lib/server/clip-queue';

/**
 * Every field a caption has, because valibot drops the ones it doesn't name.
 *
 * `v.object` strips unknown keys rather than complaining about them, so a field
 * added to TimedCaption and forgotten here doesn't fail — it saves, reports
 * success, and is gone on the next load. Both `y` and `lane` were added and
 * forgotten exactly that way.
 */
/**
 * An effect by name, with whatever dials were moved off its defaults.
 *
 * The id is left as a plain string rather than checked against the registry on
 * purpose: an unknown one falls back to a plain fade when it is drawn, which
 * means a pack can be pulled out without every clip that used it failing to
 * save. Validating here would turn a missing effect into a lost caption.
 */
const appliedEffectSchema = v.object({
  id: v.string(),
  params: v.optional(v.record(v.string(), v.union([v.number(), v.string(), v.boolean()])))
});

const timedCaptionSchema = v.object({
  start: v.number(),
  end: v.number(),
  text: v.string(),
  headline: v.optional(v.boolean()),
  /** Its own colour, when the clip's choice isn't right for this one. */
  color: v.optional(v.nullable(v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/)))),
  /** Its own panel colour, or 'none'; absent leaves it to the clip. */
  background: v.optional(
    v.nullable(v.union([v.literal('none'), v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/))]))
  ),
  /** Which of the three heights it sits at. */
  anchor: v.optional(v.picklist(['top', 'middle', 'bottom'])),
  /** The height itself — the older form of `anchor`, still read, never written. */
  y: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  /** Which timeline row it's drawn in. Nothing to do with the render. */
  lane: v.optional(v.pipe(v.number(), v.minValue(0))),
  /** How it arrives; absent leaves it to the clip, null insists on the fade. */
  effect: v.optional(v.nullable(appliedEffectSchema))
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
    bedFadeSeconds: v.pipe(v.number(), v.minValue(0)),
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
    // The three heights a caption can sit at, as a share of the frame up from
    // the bottom. Anywhere in the frame is allowed — off it is not.
    captionBackdropPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    captionTopPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    captionMiddlePercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    captionBottomPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    captionMarginX: v.pipe(v.number(), v.minValue(0)),
    fontFamily: v.string(),

    blurStrength: v.pipe(v.number(), v.minValue(0)),
    grainStrength: v.pipe(v.number(), v.minValue(0)),
    zoomRate: v.pipe(v.number(), v.minValue(0)),
    zoomMax: v.pipe(v.number(), v.minValue(1)),
    xfadeSeconds: v.pipe(v.number(), v.minValue(0)),
    edgeFillPixels: v.pipe(v.number(), v.minValue(0)),

    videoFadeInSeconds: v.pipe(v.number(), v.minValue(0)),
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
    colorizeCaption: v.boolean(),
    captionBackground: v.boolean(),
    captionEffect: v.nullable(appliedEffectSchema),
    /** Footage effects, each optionally placed on the timeline. */
    effects: v.array(
      v.object({
        ...appliedEffectSchema.entries,
        start: v.optional(v.pipe(v.number(), v.minValue(0))),
        end: v.optional(v.pipe(v.number(), v.minValue(0))),
        lane: v.optional(v.pipe(v.number(), v.minValue(0)))
      })
    ),
    /** The single look `effects` replaced. Still read, never written. */
    pictureEffect: v.nullable(appliedEffectSchema),
    fill: v.picklist(['blur', 'black', 'crop']),
    tone: v.picklist(['none', 'bw', 'warm', 'cool', 'vintage']),
    grain: v.boolean(),
    vignette: v.boolean(),
    zoom: v.boolean(),
    xfade: v.boolean(),
    speed: v.pipe(v.number(), v.minValue(0.5), v.maxValue(2)),
    videoFadeIn: v.boolean(),
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
    musicOnly: v.boolean(),
    advanced: advancedSchema
  })
);

/** Every known tag, for the tag input's autocomplete. */
export const getTags = query(async () => {
  await requireUser();
  return listTags();
});

export const createProject = command(v.object({ name: v.string() }), async ({ name }) => {
  await requireUser();

  // Seeded with whatever boilerplate was last saved as the default, so the
  // hashtags and call to action every post shares are already there.
  const siteSettings = await getClipSettings();

  const [created] = await db
    .insert(clipProjects)
    .values({
      name: name.trim() || 'Untitled clip',
      description: siteSettings?.defaultDescription ?? null,
      config: { ...DEFAULT_CLIP_CONFIG }
    })
    .returning();

  const defaultTagIds = siteSettings?.defaultTagIds ?? [];
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
  await requireUser();

  const stored = value.trim() || null;

  await updateClipSettings({ defaultDescription: stored });

  return { success: true, cleared: stored === null };
});

/** Stored as ids so a renamed tag stays the default it was. */
export const saveClipDefaultTags = command(v.array(v.string()), async (names) => {
  await requireUser();

  const tagIds = await resolveTags(names);
  await updateClipSettings({ defaultTagIds: tagIds });

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
    await requireUser();

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
  await requireUser();

  const [project] = await db
    .select({ outputMediaId: clipProjects.outputMediaId })
    .from(clipProjects)
    .where(eq(clipProjects.id, id))
    .limit(1);

  await db.delete(clipSources).where(eq(clipSources.projectId, id));
  await db.delete(clipAudio).where(eq(clipAudio.projectId, id));
  await db.delete(renderJobs).where(eq(renderJobs.projectId, id));
  // A phone-upload QR bound to this clip would otherwise stay valid until it
  // expired, and finalizeSessionUpload would keep filing sources against a
  // project that no longer exists.
  await db.delete(uploadSessions).where(eq(uploadSessions.projectId, id));
  await db.delete(clipPosts).where(eq(clipPosts.projectId, id));
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

/**
 * Puts files in the project's pool, without placing any of them.
 *
 * Idempotent per file: the pool is a set, so picking something already in it is
 * not an error and not a second entry — it just isn't news.
 */
export const addToPool = command(
  v.object({ projectId: v.number(), mediaIds: v.array(v.number()) }),
  async ({ projectId, mediaIds }) => {
    await requireUser();
    if (mediaIds.length === 0) return { success: true, added: 0 };

    const existing = await db
      .select({ mediaId: clipMedia.mediaId, position: clipMedia.position })
      .from(clipMedia)
      .where(eq(clipMedia.projectId, projectId));

    const have = new Set(existing.map((row) => row.mediaId));
    const wanted = [...new Set(mediaIds)].filter((id) => !have.has(id));
    if (wanted.length === 0) return { success: true, added: 0 };

    let position = existing.reduce((max, row) => Math.max(max, row.position ?? 0), 0);
    await db
      .insert(clipMedia)
      .values(wanted.map((mediaId) => ({ projectId, mediaId, position: ++position })));

    return { success: true, added: wanted.length };
  }
);

/**
 * Takes a file out of the pool, and every placement of it with it.
 *
 * Leaving the placements would leave blocks on the timeline referring to
 * something the project no longer has, which is a worse state than either
 * having it or not. Returns what went so it can all be put back.
 */
export const removeFromPool = command(
  v.object({ projectId: v.number(), mediaId: v.number() }),
  async ({ projectId, mediaId }) => {
    await requireUser();

    const where = (table: typeof clipSources | typeof clipAudio) =>
      and(eq(table.projectId, projectId), eq(table.mediaId, mediaId));

    const sources = await db.select().from(clipSources).where(where(clipSources));
    const audio = await db.select().from(clipAudio).where(where(clipAudio));

    await db.delete(clipSources).where(where(clipSources));
    await db.delete(clipAudio).where(where(clipAudio));
    await db
      .delete(clipMedia)
      .where(and(eq(clipMedia.projectId, projectId), eq(clipMedia.mediaId, mediaId)));

    return { success: true, sources, audio };
  }
);

/** Puts a pooled file, and everything that was placed from it, back. */
export const restoreToPool = command(
  v.object({
    projectId: v.number(),
    mediaId: v.number(),
    sources: v.array(v.record(v.string(), v.any())),
    audio: v.array(v.record(v.string(), v.any()))
  }),
  async ({ projectId, mediaId, sources, audio }) => {
    await requireUser();

    const [last] = await db
      .select({ position: clipMedia.position })
      .from(clipMedia)
      .where(eq(clipMedia.projectId, projectId))
      .orderBy(desc(clipMedia.position))
      .limit(1);

    await db
      .insert(clipMedia)
      .values({ projectId, mediaId, position: (last?.position ?? 0) + 1 })
      .onConflictDoNothing();

    if (sources.length) await db.insert(clipSources).values(sources as never);
    if (audio.length) await db.insert(clipAudio).values(audio as never);

    return { success: true };
  }
);

/**
 * Adds a clip, landing after everything already on the timeline.
 *
 * `start` used to be left at its default of zero, so every clip added arrived
 * stacked underneath the first one — invisible on the strip until you noticed
 * the first block had grown a shadow and dragged it off. Where a new thing goes
 * is a decision, and "nowhere in particular" isn't one.
 *
 * The end of the last placement rather than the sum of the lengths: clips can
 * sit anywhere now, with gaps between them and overlaps across them, so the
 * only thing "after everything" can mean is past the furthest end.
 */
export const placeSource = command(
  v.object({ projectId: v.number(), mediaId: v.number() }),
  async ({ projectId, mediaId }) => {
    await requireUser();

    const existing = await db
      .select({
        position: clipSources.position,
        start: clipSources.start,
        trimStart: clipSources.trimStart,
        trimEnd: clipSources.trimEnd,
        durationMs: media.durationMs
      })
      .from(clipSources)
      .leftJoin(media, eq(media.id, clipSources.mediaId))
      .where(eq(clipSources.projectId, projectId));

    const [project] = await db
      .select({ config: clipProjects.config })
      .from(clipProjects)
      .where(eq(clipProjects.id, projectId))
      .limit(1);

    // The speed the whole clip plays at, which is what turns a trim window in
    // source seconds into the length a block occupies.
    const speed = (project?.config as ClipRenderConfig | null)?.speed || 1;

    const end = existing.reduce((furthest, row) => {
      const length =
        row.trimStart != null && row.trimEnd != null
          ? Math.max(0, row.trimEnd - row.trimStart)
          : (row.durationMs ?? 0) / 1000;
      return Math.max(furthest, (row.start ?? 0) + length / speed);
    }, 0);

    const [created] = await db
      .insert(clipSources)
      .values({
        projectId,
        mediaId,
        start: Math.round(end * 100) / 100,
        position: existing.reduce((max, s) => Math.max(max, s.position ?? 0), 0) + 1
      })
      .returning();

    return { success: true, source: created };
  }
);

/**
 * Places a bed, landing after everything already on the timeline.
 *
 * Position comes from the current highest rather than a count, so a list with a
 * gap in it — anything removed from the middle — still appends rather than
 * colliding.
 */
export const placeAudio = command(
  v.object({ projectId: v.number(), mediaId: v.number() }),
  async ({ projectId, mediaId }) => {
    await requireUser();

    const existing = await db
      .select({
        position: clipAudio.position,
        start: clipAudio.start,
        end: clipAudio.end,
        seek: clipAudio.seek,
        durationMs: media.durationMs
      })
      .from(clipAudio)
      .leftJoin(media, eq(media.id, clipAudio.mediaId))
      .where(eq(clipAudio.projectId, projectId));

    const end = existing.reduce((furthest, row) => {
      // An open-ended bed runs until the clip does, which this side can't know.
      // Its own remaining length is the honest stand-in.
      const stop =
        row.end ?? (row.start ?? 0) + Math.max(0, (row.durationMs ?? 0) / 1000 - (row.seek ?? 0));
      return Math.max(furthest, stop);
    }, 0);

    const [created] = await db
      .insert(clipAudio)
      .values({
        projectId,
        mediaId,
        start: Math.round(end * 100) / 100,
        position: existing.reduce((max, a) => Math.max(max, a.position ?? 0), 0) + 1
      })
      .returning();

    return { success: true, track: created };
  }
);

/**
 * Turns a file a quarter, for every clip that uses it.
 *
 * Keyed on the media rather than on one placement, because that is what it
 * does: the footage itself is rewritten, so all three blocks made from a shot
 * turn together and so does every other clip in the site that uses it. Any
 * render-time correction sitting on a placement is folded into the turn and
 * then cleared, or the picture would spin back the moment the column went.
 */
export const rotateFootage = command(
  v.object({ projectId: v.number(), mediaId: v.number() }),
  async ({ projectId, mediaId }) => {
    await requireUser();

    const placements = await db
      .select({ id: clipSources.id, rotation: clipSources.rotation })
      .from(clipSources)
      .where(and(eq(clipSources.projectId, projectId), eq(clipSources.mediaId, mediaId)));

    // Whatever correction was already being applied at render time is real and
    // on screen, so it moves into the file rather than being dropped.
    const pending = placements.find((row) => row.rotation)?.rotation ?? 0;

    const result = await rotateMedia(mediaId, 90 + pending);
    if (!result.ok) {
      return {
        success: false,
        message:
          result.reason === 'unsupported'
            ? "This file's container can't hold a rotation"
            : 'That file is missing'
      };
    }

    if (pending) {
      await db
        .update(clipSources)
        .set({ rotation: 0 })
        .where(and(eq(clipSources.projectId, projectId), eq(clipSources.mediaId, mediaId)));
    }

    return { success: true, rotation: result.rotation };
  }
);

export const updateSource = command(
  v.object({
    id: v.number(),
    trimStart: v.optional(v.nullable(v.number())),
    trimEnd: v.optional(v.nullable(v.number())),
    muted: v.optional(v.boolean()),
    fadeIn: v.optional(v.boolean()),
    fadeOut: v.optional(v.boolean()),
    watermark: v.optional(v.nullable(v.boolean())),
    start: v.optional(v.pipe(v.number(), v.minValue(0))),
    lane: v.optional(v.pipe(v.number(), v.minValue(0))),
    // Right angles only — this straightens footage, it doesn't tilt it.
    rotation: v.optional(v.picklist([...CLIP_ROTATIONS]))
  }),
  async ({ id, ...fields }) => {
    await requireUser();

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (Object.keys(update).length === 0) return { success: true };

    await db.update(clipSources).set(update).where(eq(clipSources.id, id));
    return { success: true };
  }
);

/*
 * Putting back what was just removed.
 *
 * The id comes back with the row. Nothing else references a source or a bed by
 * id, so a new one would do — but the position wouldn't survive a re-add, and
 * "undo" that quietly moves a clip to the end of the list is not undo. SQLite's
 * AUTOINCREMENT never reissues an id, so the original is always free to take.
 *
 * Both are idempotent through `onConflictDoNothing`: the toast can only be
 * pressed once, but a double-tap on a phone is one press as far as the person
 * is concerned.
 */
export const restoreSource = command(
  v.object({
    id: v.number(),
    projectId: v.number(),
    mediaId: v.number(),
    position: v.nullable(v.number()),
    trimStart: v.nullable(v.number()),
    trimEnd: v.nullable(v.number()),
    muted: v.nullable(v.boolean()),
    watermark: v.nullable(v.boolean()),
    rotation: v.nullable(v.number())
  }),
  async (row) => {
    await requireUser();
    await db.insert(clipSources).values(row).onConflictDoNothing();
    return { success: true };
  }
);

export const restoreAudio = command(
  v.object({
    id: v.number(),
    projectId: v.number(),
    mediaId: v.number(),
    position: v.nullable(v.number()),
    start: v.nullable(v.number()),
    end: v.nullable(v.number()),
    seek: v.nullable(v.number()),
    fadeIn: v.nullable(v.boolean()),
    fadeOut: v.nullable(v.boolean()),
    duck: v.nullable(v.boolean())
  }),
  async (row) => {
    await requireUser();
    await db.insert(clipAudio).values(row).onConflictDoNothing();
    return { success: true };
  }
);

export const updateAudio = command(
  v.object({
    id: v.number(),
    start: v.optional(v.pipe(v.number(), v.minValue(0))),
    end: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
    seek: v.optional(v.pipe(v.number(), v.minValue(0))),
    fadeIn: v.optional(v.boolean()),
    fadeOut: v.optional(v.boolean()),
    duck: v.optional(v.boolean())
  }),
  async ({ id, ...fields }) => {
    await requireUser();

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }
    if (Object.keys(update).length === 0) return { success: true };

    await db.update(clipAudio).set(update).where(eq(clipAudio.id, id));
    return { success: true };
  }
);

export const removeAudio = command(v.number(), async (id) => {
  await requireUser();
  await db.delete(clipAudio).where(eq(clipAudio.id, id));
  return { success: true };
});

export const removeSource = command(v.number(), async (id) => {
  await requireUser();

  await db.delete(clipSources).where(eq(clipSources.id, id));
  return { success: true };
});

/*
 * Putting back what was just removed.
 *
 * The id comes back with the row. Nothing else references a source or a bed by
 * id, so a new one would do — but the position wouldn't survive a re-add, and
 * "undo" that quietly moves a clip to the end of the list is not undo. SQLite's
 * AUTOINCREMENT never reissues an id, so the original is always free to take.
 *
 * Both are idempotent through `onConflictDoNothing`: the toast can only be
 * pressed once, but a double-tap on a phone is one press as far as the person
 * is concerned.
 */

export const startRender = command(
  v.object({ projectId: v.number(), proof: v.optional(v.boolean()) }),
  async ({ projectId, proof = false }) => {
    await requireUser();

    const sources = await db
      .select()
      .from(clipSources)
      .where(eq(clipSources.projectId, projectId))
      .orderBy(asc(clipSources.position));

    if (sources.length === 0) {
      return { success: false, message: 'Add at least one source clip first' };
    }

    const job = await enqueueRender(projectId, proof);
    return { success: true, job };
  }
);

export const stopRender = command(v.number(), async (jobId) => {
  await requireUser();

  const cancelled = await cancelRender(jobId);
  return { success: cancelled };
});

/** Polled by the UI while a render is in flight. */
export const getRenderStatus = query(v.number(), async (projectId) => {
  await requireUser();

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
    await requireUser();

    return submitForReview(projectId, origin);
  }
);

export const createPreviewLink = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    await requireUser();

    const token = await ensurePreviewToken(projectId);
    return { success: true, url: previewUrl(origin, token) };
  }
);

export const resetPreviewLink = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    await requireUser();

    const token = await rotatePreviewToken(projectId);
    return { success: true, url: previewUrl(origin, token) };
  }
);

export const addToQueue = command(v.number(), async (projectId) => {
  await requireUser();

  return enqueueForRelease(projectId);
});

export const removeFromQueue = command(v.number(), async (projectId) => {
  await requireUser();

  await dequeue(projectId);
  return { success: true };
});

export const setQueueGap = command(
  v.object({ projectId: v.number(), days: v.nullable(v.number()) }),
  async ({ projectId, days }) => {
    await requireUser();

    await db
      .update(clipProjects)
      .set({ queueGapDays: days, updatedAt: new Date() })
      .where(eq(clipProjects.id, projectId));
    return { success: true };
  }
);

/**
 * Pins a queued clip to a date, or clears the pin and hands it back to the drip.
 *
 * Arrives as a `datetime-local` string, which carries no zone — it means the
 * wall clock the admin was looking at, so it's parsed as local time, which is
 * also the zone the release tick runs in.
 */
export const setScheduledDate = command(
  v.object({ projectId: v.number(), when: v.nullable(v.string()) }),
  async ({ projectId, when }) => {
    await requireUser();

    let scheduledFor: Date | null = null;
    if (when) {
      scheduledFor = new Date(when);
      if (Number.isNaN(scheduledFor.getTime())) {
        return { success: false, error: 'That date could not be read' };
      }
    }

    await db
      .update(clipProjects)
      .set({ scheduledFor, updatedAt: new Date() })
      .where(eq(clipProjects.id, projectId));

    return { success: true };
  }
);

/** Releases a clip immediately, ahead of its slot. */
export const publishNow = command(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    await requireUser();

    return publishClip(projectId, origin);
  }
);

export const getPostSheet = query(
  v.object({ projectId: v.number(), origin: v.string() }),
  async ({ projectId, origin }) => {
    await requireUser();

    return buildPostSheet(projectId, origin);
  }
);
