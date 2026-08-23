import { join } from 'path';
import { writeFile, unlink, stat } from 'fs/promises';
import { eq, and, ne, asc, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { UPLOAD_DIR, THUMBNAIL_SIZE, mediaPath } from './paths';
import { db } from './db';
import {
  renderJobs,
  clipProjects,
  clipSources,
  media,
  settings,
  DEFAULT_CLIP_CONFIG,
  type ClipRenderConfig,
  type TimedCaption
} from './schema';
import { renderClip, type ClipSourceInput } from './clip-render';
import { probeVideo, extractPosterFrame } from './ffmpeg';

/**
 * Serial in-process render queue.
 *
 * Renders are CPU-bound ffmpeg runs measured in minutes, so they can't happen
 * inside a request and shouldn't happen concurrently — two at once just make
 * each other slower. Jobs live in the database, so progress survives a page
 * reload and a failed render keeps its log for debugging.
 */

let running = false;
/** Abort controllers for in-flight jobs, so a render can be cancelled. */
const inFlight = new Map<number, AbortController>();

/**
 * Clears jobs left mid-render by a crash or restart.
 *
 * Without this a killed process leaves rows stuck in 'rendering' forever, and
 * the UI would show a spinner for a job nothing is working on.
 */
export async function recoverStaleJobs(): Promise<void> {
  const stale = await db
    .update(renderJobs)
    .set({
      status: 'failed',
      error: 'Render was interrupted by a server restart',
      finishedAt: new Date()
    })
    .where(eq(renderJobs.status, 'rendering'))
    .returning({ id: renderJobs.id });

  if (stale.length) {
    console.log(`[RenderQueue] Recovered ${stale.length} interrupted job(s)`);
  }
}

/** Queues a render for a project and returns the new job. */
export async function enqueueRender(projectId: number) {
  const [job] = await db
    .insert(renderJobs)
    .values({ projectId, status: 'queued', progress: 0 })
    .returning();

  // Deliberately not awaited: the caller gets the job row immediately and polls.
  void processQueue();

  return job;
}

/** Cancels a queued or in-flight render. */
export async function cancelRender(jobId: number): Promise<boolean> {
  const controller = inFlight.get(jobId);
  if (controller) {
    controller.abort();
    return true;
  }

  // Not started yet — just drop it from the queue.
  const [updated] = await db
    .update(renderJobs)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(renderJobs.id, jobId), eq(renderJobs.status, 'queued')))
    .returning({ id: renderJobs.id });

  return Boolean(updated);
}

/** Runs queued jobs one at a time until none are left. */
export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;

  try {
    for (;;) {
      const [job] = await db
        .select()
        .from(renderJobs)
        .where(eq(renderJobs.status, 'queued'))
        .orderBy(asc(renderJobs.createdAt))
        .limit(1);

      if (!job) return;

      await runJob(job.id, job.projectId);
    }
  } finally {
    running = false;
  }
}

async function runJob(jobId: number, projectId: number): Promise<void> {
  const controller = new AbortController();
  inFlight.set(jobId, controller);

  await db
    .update(renderJobs)
    .set({ status: 'rendering', startedAt: new Date(), progress: 0 })
    .where(eq(renderJobs.id, jobId));

  const logLines: string[] = [];
  let outputPath: string | undefined;

  try {
    const input = await buildRenderInput(projectId);

    // Throttle progress writes: ffmpeg reports many times a second, and every
    // write would be a needless database round trip.
    let lastWrite = 0;
    let lastPercent = -1;

    const result = await renderClip(input.render, {
      signal: controller.signal,
      onLog: (line) => {
        logLines.push(line);
      },
      onProgress: (percent) => {
        const now = Date.now();
        if (percent === lastPercent || now - lastWrite < 1000) return;
        lastWrite = now;
        lastPercent = percent;
        // .catch() rather than a bare call: drizzle's builders are lazy and only
        // run once something subscribes to them, so `void db.update(...)` would
        // silently never execute and the UI would sit at 0% until completion.
        db.update(renderJobs)
          .set({ progress: percent })
          .where(eq(renderJobs.id, jobId))
          .catch(() => {
            // A dropped progress write is cosmetic; the next tick retries.
          });
      }
    });

    outputPath = result.outputPath;

    const mediaId = await registerOutput(
      result.outputPath,
      result.coverPath,
      input.baseName,
      input.name
    );

    await db
      .update(renderJobs)
      .set({
        status: 'done',
        progress: 100,
        mediaId,
        log: logLines.join('\n'),
        finishedAt: new Date()
      })
      .where(eq(renderJobs.id, jobId));

    // A fresh render invalidates any prior verdict: an approved clip drops back
    // to `rendered` so a change can't ride out on an old approval. Clips already
    // queued or published are left alone — re-rendering those is a deliberate
    // act and shouldn't silently pull them out of the schedule.
    const [current] = await db
      .select({ status: clipProjects.status, outputMediaId: clipProjects.outputMediaId })
      .from(clipProjects)
      .where(eq(clipProjects.id, projectId))
      .limit(1);

    const keepStatus = current?.status === 'queued' || current?.status === 'published';

    await db
      .update(clipProjects)
      .set({
        outputMediaId: mediaId,
        updatedAt: new Date(),
        ...(keepStatus ? {} : { status: 'rendered' as const, reviewNote: null, reviewedAt: null })
      })
      .where(eq(clipProjects.id, projectId));

    // Only once the project points at the new render — an interruption before
    // this leaves the old file in place, which is the safe way to fail.
    await discardSupersededRender(current?.outputMediaId ?? null, projectId);
  } catch (e) {
    // A cancelled render leaves a partial file behind; don't keep it.
    if (outputPath) await unlink(outputPath).catch(() => {});

    const cancelled = controller.signal.aborted;
    const message = e instanceof Error ? e.message : String(e);

    if (!cancelled) console.error(`[RenderQueue] Job ${jobId} failed:`, message);

    await db
      .update(renderJobs)
      .set({
        status: cancelled ? 'cancelled' : 'failed',
        error: cancelled ? null : message,
        log: logLines.join('\n'),
        finishedAt: new Date()
      })
      .where(eq(renderJobs.id, jobId));
  } finally {
    inFlight.delete(jobId);
  }
}

/**
 * Picks the graphic for a render.
 *
 * Order: a random pick from the designated set if the clip asked for one, then
 * the clip's own choice, then the site default. Returns null when nothing is
 * designated, which sends the caller down the favicon path rather than failing
 * — a graphic isn't worth losing a render over.
 */
function resolveGraphic(
  config: ClipRenderConfig,
  designated: number[],
  defaultGraphicMediaId: number | null
): number | null {
  if (config.randomGraphics && designated.length) {
    return designated[Math.floor(Math.random() * designated.length)];
  }

  const picked = config.graphicMediaId ?? defaultGraphicMediaId;
  // Only honour a pick that's still designated: un-designating a graphic
  // shouldn't leave clips quietly rendering with it.
  if (picked && designated.includes(picked)) return picked;

  return designated.length ? (defaultGraphicMediaId ?? designated[0]) : null;
}

/** Loads a project and resolves it into renderer input. */
async function buildRenderInput(projectId: number) {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) throw new Error('Clip project not found');

  const sourceRows = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, projectId))
    .orderBy(asc(clipSources.position));

  if (sourceRows.length === 0) {
    throw new Error('Add at least one source clip before rendering');
  }

  const config: ClipRenderConfig = { ...DEFAULT_CLIP_CONFIG, ...(project.config ?? {}) };

  // Resolve every referenced media row in one query.
  const referencedIds = [
    ...sourceRows.map((s) => s.mediaId),
    ...(config.logoMediaId ? [config.logoMediaId] : []),
    ...(config.musicMediaId ? [config.musicMediaId] : [])
  ];
  const mediaRows = await db.select().from(media).where(inArray(media.id, referencedIds));
  const byId = new Map(mediaRows.map((m) => [m.id, m]));

  const sources: ClipSourceInput[] = sourceRows.map((row) => {
    const item = byId.get(row.mediaId);
    if (!item) throw new Error(`Source clip ${row.mediaId} is missing from the media library`);
    return {
      path: mediaPath(item.url),
      trimStart: row.trimStart,
      trimEnd: row.trimEnd,
      muted: row.muted,
      watermark: row.watermark
    };
  });

  const [siteSettings] = await db.select().from(settings).limit(1);

  const designated = (siteSettings?.clipGraphicsMediaIds ?? []) as number[];
  const graphicId = resolveGraphic(
    config,
    designated,
    siteSettings?.defaultClipGraphicMediaId ?? null
  );

  // One graphic serves all three placements, rasterised at each size. Falling
  // back to the site favicon is a poor last resort — it's square and sized to
  // read at 16px — but better than rendering an unbranded clip.
  let graphicPath: string | null = null;
  if (graphicId) {
    const [item] = await db.select().from(media).where(eq(media.id, graphicId)).limit(1);
    if (item) graphicPath = mediaPath(item.url);
  }
  if (!graphicPath) {
    const legacy = config.logoMediaId ? byId.get(config.logoMediaId) : undefined;
    graphicPath = legacy
      ? mediaPath(legacy.url)
      : siteSettings?.faviconUrl
        ? mediaPath(siteSettings.faviconUrl)
        : null;
  }

  const musicItem = config.musicMediaId ? byId.get(config.musicMediaId) : undefined;

  const baseName = `clip-${Date.now()}`;
  const outputPath = join(UPLOAD_DIR, `${baseName}.mp4`);

  // Record which graphic this render used, so a random pick is inspectable
  // afterwards instead of being a guess.
  if ((graphicId ?? null) !== project.resolvedGraphicMediaId) {
    await db
      .update(clipProjects)
      .set({ resolvedGraphicMediaId: graphicId ?? null })
      .where(eq(clipProjects.id, projectId));
  }

  return {
    name: project.name,
    baseName,
    render: {
      sources,
      config: {
        ...config,
        logoColor: config.logoColor || siteSettings?.colorAccent || '#8b5cf6'
      },
      captions: (project.captions ?? []) as TimedCaption[],
      introPath: graphicPath,
      watermarkPath: graphicPath,
      outroPath: graphicPath,
      musicPath: musicItem ? mediaPath(musicItem.url) : null,
      outputPath
    }
  };
}

/**
 * Adds a finished render to the media library.
 *
 * Prefers the renderer's branded cover as the thumbnail — it's chosen to avoid
 * a black frame and to include the logo — and falls back to a poster frame.
 */
async function registerOutput(
  outputPath: string,
  coverPath: string | undefined,
  baseName: string,
  projectName: string
): Promise<number> {
  const metadata = await probeVideo(outputPath);
  const size = (await stat(outputPath)).size;

  const posterSource = coverPath
    ? await sharp(coverPath).toBuffer()
    : await extractPosterFrame(outputPath, metadata.duration);

  const thumbnailFilename = `${baseName}-thumb.webp`;
  await writeFile(
    join(UPLOAD_DIR, thumbnailFilename),
    await sharp(posterSource)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  );

  // The full-size cover has done its job now that the thumbnail exists. Nothing
  // reads it afterwards, so leaving it behind would just accumulate one dead
  // JPEG per render. If it's ever wanted for manual posting it needs to become
  // a real field on the row, not an untracked file on disk.
  if (coverPath) await unlink(coverPath).catch(() => {});

  const url = `/uploads/${baseName}.mp4`;

  const [row] = await db
    .insert(media)
    .values({
      filename: `${projectName}.mp4`,
      url,
      originalUrl: url,
      thumbnailUrl: `/uploads/${thumbnailFilename}`,
      mimeType: 'video/mp4',
      width: metadata.width,
      height: metadata.height,
      durationMs: Math.round(metadata.duration * 1000),
      size,
      originalSize: size,
      role: 'render',
      alt: projectName
    })
    .returning();

  return row.id;
}

/**
 * Removes the render a new one supersedes — row, video and thumbnail.
 *
 * Without this, iterating on a clip leaves a multi-megabyte file and a
 * near-identical library entry behind on every attempt, which is exactly when
 * you re-render most. Skipped if anything else still points at the row, and
 * never allowed to fail a render that has already succeeded.
 */
async function discardSupersededRender(
  previousMediaId: number | null,
  projectId: number
): Promise<void> {
  if (!previousMediaId) return;

  try {
    const [prev] = await db.select().from(media).where(eq(media.id, previousMediaId)).limit(1);
    // Only ever sweep our own output; a hand-picked asset must survive.
    if (!prev || prev.role !== 'render') return;

    const others = await db
      .select({ id: clipProjects.id })
      .from(clipProjects)
      .where(and(eq(clipProjects.outputMediaId, previousMediaId), ne(clipProjects.id, projectId)));
    if (others.length) return;

    await db.delete(media).where(eq(media.id, previousMediaId));

    for (const url of [prev.url, prev.thumbnailUrl]) {
      if (url) await unlink(mediaPath(url)).catch(() => {});
    }
  } catch (e) {
    console.error('[RenderQueue] Could not discard superseded render:', e);
  }
}
