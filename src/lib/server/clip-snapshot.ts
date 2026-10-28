/**
 * A clip's editable state, taken whole and put back whole.
 *
 * Undo in this editor is a snapshot rather than an inverse per write. Two
 * reasons, both learned here rather than assumed:
 *
 * The inverses drift. `restoreSource` carried nine of `clip_sources`' seventeen
 * columns for months, so undoing a removed shot returned it without its
 * position on the strip, its lane, its fades, its fill, its framing or its
 * look — and nothing said so, because an inverse that forgets a column still
 * runs. Twenty-one hand-written inverses is twenty-one chances at that, every
 * time a column is added.
 *
 * And the gestures that matter most are not one row. A ripple moves everything
 * after a point; turning a cut into a dissolve edits both shots and the
 * dissolve's own bookkeeping. A snapshot covers those the same way it covers a
 * colour change, because it does not know the difference.
 *
 * What is deliberately *not* in here: the media files, which outlive any edit
 * and are what a restored row points at; the render and its job, which are
 * output rather than edit; and the tags, which are their own table and their
 * own undo if they ever need one.
 */
import { and, eq, notInArray } from 'drizzle-orm';
import { db } from './db';
import { clipProjects, clipSources, clipAudio } from './schema';

export interface ClipSnapshot {
  /** Which clip this is of — a snapshot restored onto another would be a copy. */
  projectId: number;
  /** The fields of the project row that an edit can change. */
  project: {
    name: string;
    description: string | null;
    config: unknown;
    captions: unknown;
  };
  sources: (typeof clipSources.$inferSelect)[];
  audio: (typeof clipAudio.$inferSelect)[];
}

/**
 * Everything an edit can change about one clip.
 *
 * Whole rows rather than a chosen list of columns: the point of a snapshot is
 * that nobody has to remember what is in it.
 */
export async function clipSnapshot(projectId: number): Promise<ClipSnapshot | null> {
  const [project] = await db
    .select({
      name: clipProjects.name,
      description: clipProjects.description,
      config: clipProjects.config,
      captions: clipProjects.captions
    })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) return null;

  const [sources, audio] = await Promise.all([
    db.select().from(clipSources).where(eq(clipSources.projectId, projectId)),
    db.select().from(clipAudio).where(eq(clipAudio.projectId, projectId))
  ]);

  return { projectId, project, sources, audio };
}

/**
 * Puts one back.
 *
 * Rows are written under their own ids, which is what lets the strip, the
 * selection and the history go on talking about the same shot across an undo.
 * Anything added since the snapshot is removed, anything missing is put back,
 * and the rest is overwritten — so this is the state as it was, not merged
 * with the state as it is.
 *
 * One transaction. Half a restored clip is an arrangement nobody chose, and a
 * failure partway through would leave exactly that.
 */
export async function restoreClip(snapshot: ClipSnapshot): Promise<void> {
  const { projectId, project, sources, audio } = snapshot;

  db.transaction((tx) => {
    tx.update(clipProjects)
      .set({
        name: project.name,
        description: project.description,
        config: project.config as never,
        captions: project.captions as never,
        updatedAt: new Date()
      })
      .where(eq(clipProjects.id, projectId))
      .run();

    const sourceIds = sources.map((row) => row.id);
    tx.delete(clipSources)
      .where(
        sourceIds.length
          ? and(eq(clipSources.projectId, projectId), notInArray(clipSources.id, sourceIds))
          : eq(clipSources.projectId, projectId)
      )
      .run();
    for (const row of sources) {
      tx.insert(clipSources)
        .values(row)
        .onConflictDoUpdate({ target: clipSources.id, set: row })
        .run();
    }

    const audioIds = audio.map((row) => row.id);
    tx.delete(clipAudio)
      .where(
        audioIds.length
          ? and(eq(clipAudio.projectId, projectId), notInArray(clipAudio.id, audioIds))
          : eq(clipAudio.projectId, projectId)
      )
      .run();
    for (const row of audio) {
      tx.insert(clipAudio).values(row).onConflictDoUpdate({ target: clipAudio.id, set: row }).run();
    }
  });
}

/** Whether two snapshots describe the same clip, for skipping no-op steps. */
export function sameClipState(a: ClipSnapshot, b: ClipSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
