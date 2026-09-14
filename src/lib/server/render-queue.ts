import { join } from 'path';
import { writeFile, unlink, stat } from 'fs/promises';
import { eq, and, ne, asc, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { UPLOAD_DIR, THUMBNAIL_SIZE, mediaPath, removeMediaFile } from './paths';
import { db } from './db';
import { getSettings, getClipSettings } from './settings';
import {
  renderJobs,
  clipProjects,
  clipSources,
  clipAudio,
  media,
  settings,
  DEFAULT_CLIP_CONFIG,
  type ClipRenderConfig,
  type TimedCaption
} from './schema';
import { renderClip, type ClipSourceInput, type ClipAudioInput } from './clip-render';
import { stageGraphicId, type BrandStage } from '$lib/clips/types';
import { renderFingerprint } from '$lib/clips/fingerprint';
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
    // "Cleared", not "recovered": nothing is resumed here. The row is marked
    // failed so the editor stops waiting on it, and the render has to be asked
    // for again. A line that says otherwise reads like the work is still coming.
    console.log(`[RenderQueue] Cleared ${stale.length} interrupted job(s) — render again to retry`);
  }
}

/** Queues a render for a project and returns the new job. */
export async function enqueueRender(projectId: number, proof = false) {
  const [job] = await db
    .insert(renderJobs)
    .values({ projectId, status: 'queued', progress: 0, proof })
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

      await runJob(job.id, job.projectId, job.proof ?? false);
    }
  } finally {
    running = false;
  }
}

async function runJob(jobId: number, projectId: number, proof = false): Promise<void> {
  const controller = new AbortController();
  inFlight.set(jobId, controller);

  await db
    .update(renderJobs)
    .set({ status: 'rendering', startedAt: new Date(), progress: 0 })
    .where(eq(renderJobs.id, jobId));

  const logLines: string[] = [];
  let outputPath: string | undefined;

  try {
    const input = await buildRenderInput(projectId, proof);

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
      input.name,
      proof
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

    const [current] = await db
      .select({
        status: clipProjects.status,
        outputMediaId: clipProjects.outputMediaId,
        proofMediaId: clipProjects.proofMediaId
      })
      .from(clipProjects)
      .where(eq(clipProjects.id, projectId))
      .limit(1);

    if (proof) {
      /*
       * A proof changes nothing about where the clip stands. It isn't a render
       * in the sense the rest of the studio means — nobody can review it, queue
       * it or publish it — so it leaves the status, the verdict and
       * `outputMediaId` exactly as it found them.
       */
      await db
        .update(clipProjects)
        .set({ proofMediaId: mediaId, proofFingerprint: input.fingerprint })
        .where(eq(clipProjects.id, projectId));

      await discardSupersededRender(current?.proofMediaId ?? null, projectId, 'proof');
    } else {
      // A fresh render invalidates any prior verdict: an approved clip drops
      // back to `rendered` so a change can't ride out on an old approval. Clips
      // already queued or published are left alone — re-rendering those is a
      // deliberate act and shouldn't silently pull them out of the schedule.
      const keepStatus = current?.status === 'queued' || current?.status === 'published';

      await db
        .update(clipProjects)
        .set({
          outputMediaId: mediaId,
          renderFingerprint: input.fingerprint,
          // The real thing supersedes the proof of it, whatever order they were
          // made in: leaving one behind would go on driving the player.
          proofMediaId: null,
          proofFingerprint: null,
          updatedAt: new Date(),
          ...(keepStatus ? {} : { status: 'rendered' as const, reviewNote: null, reviewedAt: null })
        })
        .where(eq(clipProjects.id, projectId));

      // Only once the project points at the new render — an interruption before
      // this leaves the old file in place, which is the safe way to fail.
      await discardSupersededRender(current?.outputMediaId ?? null, projectId);
      await discardSupersededRender(current?.proofMediaId ?? null, projectId, 'proof');
    }
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
 * Order: the stage's own mark, then the clip's, then the site default. Returns
 * null when nothing is designated, which sends the caller down the favicon path rather than failing
 * — a graphic isn't worth losing a render over.
 */
function resolveGraphic(
  config: ClipRenderConfig,
  designated: number[],
  defaultGraphicMediaId: number | null,
  /** Which of the three this is for; each may carry a mark of its own. */
  stage: BrandStage
): number | null {
  const picked = stageGraphicId(config, stage) ?? defaultGraphicMediaId;
  // Only honour a pick that's still designated: un-designating a graphic
  // shouldn't leave clips quietly rendering with it.
  if (picked && designated.includes(picked)) return picked;

  return designated.length ? (defaultGraphicMediaId ?? designated[0]) : null;
}

/** Loads a project and resolves it into renderer input. */
async function buildRenderInput(projectId: number, proof = false) {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) throw new Error('Clip project not found');

  /*
   * In the order they play, which is `start` — not `position`, which is only
   * the order they were added in.
   *
   * The two agreed when adding and placing were one action. They stop agreeing
   * the moment a block is dragged, and `isSequential` walks this list comparing
   * each start against a running total: given them out of order it decides the
   * clip isn't a sequence and takes the composite path, which re-encodes
   * everything to produce what a stream copy would have.
   */
  const sourceRows = await db
    .select()
    .from(clipSources)
    .where(eq(clipSources.projectId, projectId))
    .orderBy(asc(clipSources.start), asc(clipSources.position));

  if (sourceRows.length === 0) {
    throw new Error('Add at least one source clip before rendering');
  }

  const config: ClipRenderConfig = { ...DEFAULT_CLIP_CONFIG, ...(project.config ?? {}) };

  // The beds, in the order they're listed on the clip.
  const audioRows = await db
    .select()
    .from(clipAudio)
    .where(eq(clipAudio.projectId, projectId))
    .orderBy(asc(clipAudio.position));

  // Resolve every referenced media row in one query.
  const referencedIds = [...sourceRows.map((s) => s.mediaId), ...audioRows.map((a) => a.mediaId)];
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
      watermark: row.watermark,
      rotation: row.rotation,
      fadeIn: row.fadeIn,
      fadeOut: row.fadeOut,
      start: row.start ?? 0,
      lane: row.lane ?? 0
    };
  });

  const [site, clips] = await Promise.all([getSettings(), getClipSettings()]);

  const designated = (clips?.graphicsMediaIds ?? []) as number[];

  /*
   * One graphic per placement, rasterised at that placement's size.
   *
   * They used to share one, which is still what happens unless a stage has been
   * given its own — an outro card is a place to put something other than the
   * mark you have been watermarking the corner with, and the three are no
   * longer obliged to agree.
   *
   * No designated graphic means no intro, watermark or outro: the renderer
   * skips each placement whose path is null. There is deliberately no fallback,
   * because a favicon is sized to read at 16px and silently blowing it up to
   * 650px produced branding nobody asked for and couldn't turn off.
   */
  const fallbackId = clips?.defaultGraphicMediaId ?? null;
  const stagePaths: Record<BrandStage, string | null> = {
    intro: null,
    watermark: null,
    outro: null
  };

  const pathCache = new Map<number, string | null>();
  for (const stage of ['intro', 'watermark', 'outro'] as BrandStage[]) {
    const id = resolveGraphic(config, designated, fallbackId, stage);
    if (!id) continue;
    if (!pathCache.has(id)) {
      const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      pathCache.set(id, item ? mediaPath(item.url) : null);
    }
    stagePaths[stage] = pathCache.get(id) ?? null;
  }

  // What the clip is recorded as having rendered with. The intro's, to agree
  // with `graphicPath` below — the three can differ now, and one row can only
  // hold one of them.
  const graphicId = resolveGraphic(config, designated, fallbackId, 'intro');
  const graphicPath = stagePaths.intro ?? stagePaths.watermark ?? stagePaths.outro;

  /*
   * Beds whose file has gone from the library are dropped here rather than
   * handed on as a path that doesn't resolve. The renderer checks again — a row
   * can point at a media entry whose file is missing — but this is the cheaper
   * of the two and keeps the log about the render rather than the database.
   */
  const audio: ClipAudioInput[] = audioRows.flatMap((row) => {
    const item = byId.get(row.mediaId);
    if (!item) return [];
    return [
      {
        path: mediaPath(item.url),
        start: row.start ?? 0,
        end: row.end ?? null,
        seek: row.seek ?? 0,
        fadeIn: row.fadeIn ?? true,
        fadeOut: row.fadeOut ?? true,
        duck: row.duck ?? false,
        lane: row.lane ?? 0
      }
    ];
  });

  const baseName = `clip-${proof ? 'proof-' : ''}${Date.now()}`;
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
    /*
     * Taken here rather than after the render, because this is the state the
     * render is actually about to be made from. Read again at the end, it could
     * have moved on — an edit landing mid-render would be recorded as though it
     * had been included, and the clip would look current while showing frames
     * that predate it.
     */
    fingerprint: renderFingerprint({
      config,
      captions: (project.captions ?? []) as TimedCaption[],
      sources: sourceRows,
      audio: audioRows.map((row) => ({
        mediaId: row.mediaId,
        start: row.start ?? 0,
        end: row.end ?? null,
        seek: row.seek ?? 0,
        fadeIn: row.fadeIn ?? true,
        fadeOut: row.fadeOut ?? true,
        duck: row.duck ?? false,
        lane: row.lane ?? 0
      })),
      defaultGraphicMediaId: clips?.defaultGraphicMediaId ?? null
    }),
    render: {
      sources,
      config: {
        ...config,
        logoColor: config.logoColor || site?.colorAccent || '#8b5cf6',
        /*
         * "Music only" is not a switch, it's what silencing every clip means.
         *
         * There was a "Replace clip audio" toggle sitting next to a row of clips
         * each with its own mute, and the two could disagree — mute everything
         * and the beds still sat back under a mix with nothing in it, because
         * the switch said the footage audio was still notionally there.
         *
         * Asked of the placements instead: if nothing is coming from the
         * footage, the beds are the soundtrack and play at full, and there is
         * nothing left to duck under.
         */
        musicOnly: sources.length > 0 && sources.every((source) => source.muted)
      },
      captions: (project.captions ?? []) as TimedCaption[],
      introPath: stagePaths.intro,
      watermarkPath: stagePaths.watermark,
      outroPath: stagePaths.outro,
      audio,
      proof,
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
  projectName: string,
  proof = false
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
      /*
       * A role of its own. The sweep that discards a superseded render only
       * touches rows marked `render`, and a proof must never be mistaken for
       * the finished thing by that or by anything else that goes looking for
       * one — the media library included.
       */
      role: proof ? 'proof' : 'render',
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
  projectId: number,
  kind: 'render' | 'proof' = 'render'
): Promise<void> {
  if (!previousMediaId) return;

  try {
    const [prev] = await db.select().from(media).where(eq(media.id, previousMediaId)).limit(1);
    // Only ever sweep our own output, and only of the kind being replaced; a
    // hand-picked asset must survive, and so must a finished render when it's
    // a proof being thrown away.
    if (!prev || prev.role !== kind) return;

    const column = kind === 'proof' ? clipProjects.proofMediaId : clipProjects.outputMediaId;
    const others = await db
      .select({ id: clipProjects.id })
      .from(clipProjects)
      .where(and(eq(column, previousMediaId), ne(clipProjects.id, projectId)));
    if (others.length) return;

    await db.delete(media).where(eq(media.id, previousMediaId));

    for (const url of [prev.url, prev.thumbnailUrl]) {
      await removeMediaFile(url);
    }
  } catch (e) {
    console.error('[RenderQueue] Could not discard superseded render:', e);
  }
}
