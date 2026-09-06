import { db } from './db';
import { tags, taggings, type TaggableType } from './schema';
import { eq, and, inArray, notInArray, sql } from 'drizzle-orm';
import { slugify } from '$lib/utils/slug';
import { getClipSettings } from './settings';

/**
 * The shared tag vocabulary.
 *
 * Every write goes through resolveTags, so a tag is created once and matched by
 * slug thereafter — typing "Indie Rock" when "indie rock" exists attaches the
 * existing one rather than making a second. The name kept is whichever casing
 * was typed first; renaming is a separate, deliberate act.
 */

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

/** Every tag, alphabetical — small enough to hand the autocomplete whole. */
export async function listTags(): Promise<Tag[]> {
  return db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(tags).orderBy(tags.name);
}

/**
 * Maps free-typed names onto tag ids, creating any that are new.
 *
 * Deduplicates by slug within the input too, so "Rock, rock" attaches one tag
 * rather than failing the unique index.
 */
export async function resolveTags(names: string[]): Promise<number[]> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    const slug = slugify(name);
    if (slug && !wanted.has(slug)) wanted.set(slug, name);
  }
  if (wanted.size === 0) return [];

  const slugs = [...wanted.keys()];
  const existing = await db.select().from(tags).where(inArray(tags.slug, slugs));
  const bySlug = new Map(existing.map((t) => [t.slug, t.id]));

  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) {
    const created = await db
      .insert(tags)
      .values(missing.map((slug) => ({ name: wanted.get(slug)!, slug })))
      .returning();
    for (const t of created) bySlug.set(t.slug, t.id);
  }

  return slugs.map((s) => bySlug.get(s)!);
}

/** Replaces everything attached to one entity. */
export async function setTags(
  entityType: TaggableType,
  entityId: number,
  names: string[]
): Promise<void> {
  const tagIds = await resolveTags(names);
  await db
    .delete(taggings)
    .where(and(eq(taggings.entityType, entityType), eq(taggings.entityId, entityId)));
  if (tagIds.length) {
    await db.insert(taggings).values(tagIds.map((tagId) => ({ tagId, entityType, entityId })));
  }
}

/** The tags on one entity, in alphabetical order. */
export async function tagsFor(entityType: TaggableType, entityId: number): Promise<Tag[]> {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(and(eq(taggings.entityType, entityType), eq(taggings.entityId, entityId)))
    .orderBy(tags.name);
}

/**
 * Tags for a whole list, keyed by entity id.
 *
 * One query for the page rather than one per row — the media grid would
 * otherwise issue a lookup per tile.
 */
export async function tagsForMany(
  entityType: TaggableType,
  entityIds: number[]
): Promise<Map<number, Tag[]>> {
  const out = new Map<number, Tag[]>();
  if (entityIds.length === 0) return out;

  const rows = await db
    .select({ entityId: taggings.entityId, id: tags.id, name: tags.name, slug: tags.slug })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(and(eq(taggings.entityType, entityType), inArray(taggings.entityId, entityIds)))
    .orderBy(tags.name);

  for (const { entityId, ...tag } of rows) {
    const list = out.get(entityId);
    if (list) list.push(tag);
    else out.set(entityId, [tag]);
  }
  return out;
}

/** Drops every tagging for an entity. Call when the entity itself is deleted. */
export async function clearTags(entityType: TaggableType, entityId: number): Promise<void> {
  await db
    .delete(taggings)
    .where(and(eq(taggings.entityType, entityType), eq(taggings.entityId, entityId)));
}

/**
 * Deletes tags nothing points at any more.
 *
 * Called after a detach rather than on a timer: an unused tag still showing up
 * in autocomplete is the thing worth avoiding, and the table is small enough
 * that the anti-join costs nothing.
 */
export async function pruneOrphanTags(): Promise<void> {
  /*
   * A tag saved as the default for new clips is referenced by the settings, not
   * by a tagging row — so on this query's reading it is an orphan, and taking
   * the last clip that used it off the list deleted it outright. The default
   * kept the id, the id pointed at nothing, and every clip made afterwards came
   * up short a tag with nothing to say why.
   *
   * Held here rather than by giving the settings a tagging row of their own: a
   * default is a reference to a tag, not a thing that is tagged, and inventing
   * an entity for it to hang off would put a lie in the taggings table to keep
   * one query honest.
   */
  const clips = await getClipSettings();
  const spared = clips?.defaultTagIds ?? [];

  await db
    .delete(tags)
    .where(
      spared.length
        ? and(
            sql`${tags.id} not in (select ${taggings.tagId} from ${taggings})`,
            notInArray(tags.id, spared)
          )
        : sql`${tags.id} not in (select ${taggings.tagId} from ${taggings})`
    );
}
