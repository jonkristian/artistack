import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { releases, pages, links } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { claimSlug, createPageRow, toSlug } from '$lib/server/page-slug';
import { error } from '@sveltejs/kit';

/**
 * Creating a release creates its page. The two are one thing to the person
 * using this — a release you can send someone — so nothing here asks them to
 * make a page first and attach a release to it.
 */
const createSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the release a title')),
  slug: v.optional(v.string()),
  releaseDate: v.pipe(v.string(), v.nonEmpty('Pick a release date'))
});

export const createRelease = command(createSchema, async ({ title, slug, releaseDate }) => {
  await requireUser();

  const candidate = await claimSlug(slug?.trim() || title);

  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) {
    error(400, 'That release date is not a real date.');
  }

  // Draft by default, like every page: one that goes live the moment it's
  // created would be discoverable before its links are filled in.
  const page = await createPageRow({ slug: candidate, title, type: 'release' });

  const [release] = await db
    .insert(releases)
    .values({ pageId: page.id, title, releaseDate: date })
    .returning();

  return { id: release.id, slug: page.slug };
});

const updateSchema = v.object({
  id: v.number(),
  title: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty('Give the release a title'))),
  slug: v.optional(v.string()),
  releaseDate: v.optional(v.string()),
  description: v.optional(v.nullable(v.string())),
  shareImageUrl: v.optional(v.nullable(v.string())),
  presaveUrl: v.optional(v.nullable(v.string())),
  body: v.optional(v.nullable(v.string())),
  isrc: v.optional(v.nullable(v.string())),
  upc: v.optional(v.nullable(v.string())),
  coverUrl: v.optional(v.nullable(v.string())),
  published: v.optional(v.boolean())
});

export const updateRelease = command(updateSchema, async (input) => {
  await requireUser();

  const [release] = await db.select().from(releases).where(eq(releases.id, input.id)).limit(1);
  if (!release) error(404, 'Release not found');

  // Page-level fields and release-level fields are written separately because
  // they live in different tables — the split is invisible in the UI.
  const pageChanges: Record<string, unknown> = {};
  const releaseChanges: Record<string, unknown> = {};

  if (input.slug !== undefined) {
    const candidate = toSlug(input.slug);

    const [clash] = await db.select().from(pages).where(eq(pages.slug, candidate)).limit(1);
    if (clash && clash.id !== release.pageId) {
      error(400, 'Something already lives at that address.');
    }
    pageChanges.slug = candidate;
  }

  if (input.title !== undefined) {
    releaseChanges.title = input.title;
    pageChanges.title = input.title;
  }
  if (input.description !== undefined) pageChanges.description = input.description;
  if (input.shareImageUrl !== undefined) pageChanges.shareImageUrl = input.shareImageUrl;
  if (input.published !== undefined) pageChanges.published = input.published;

  if (input.releaseDate !== undefined) {
    const date = new Date(input.releaseDate);
    if (Number.isNaN(date.getTime())) error(400, 'That release date is not a real date.');
    releaseChanges.releaseDate = date;
  }
  if (input.presaveUrl !== undefined) releaseChanges.presaveUrl = input.presaveUrl;
  if (input.body !== undefined) releaseChanges.body = input.body;
  if (input.isrc !== undefined) releaseChanges.isrc = input.isrc;
  if (input.upc !== undefined) releaseChanges.upc = input.upc;
  if (input.coverUrl !== undefined) releaseChanges.coverUrl = input.coverUrl;

  if (Object.keys(pageChanges).length) {
    await db.update(pages).set(pageChanges).where(eq(pages.id, release.pageId));
  }
  if (Object.keys(releaseChanges).length) {
    await db.update(releases).set(releaseChanges).where(eq(releases.id, release.id));
  }

  return { success: true };
});

export const deleteRelease = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [release] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  if (!release) error(404, 'Release not found');

  // Links first, then the release, then the page it owned — no cascades are
  // declared, so leaving either behind would orphan rows.
  await db.delete(links).where(eq(links.releaseId, id));
  await db.delete(releases).where(eq(releases.id, id));
  await db.delete(pages).where(eq(pages.id, release.pageId));

  return { success: true };
});

/**
 * Tell the fan list, now, rather than waiting for the morning.
 *
 * The same function the scheduler calls, so the checks are the same ones —
 * already announced, page still a draft, no services to press. What comes back
 * says which of those happened, because "nothing was sent" needs a reason.
 */
export const announceReleaseNow = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const { announceRelease } = await import('$lib/server/announce');
  const { getRequestEvent } = await import('$app/server');
  const { url } = getRequestEvent();

  return announceRelease(id, url.origin);
});

/**
 * Ask the stores where this record ended up, now.
 *
 * The scheduler does this hourly on its own, and on release morning that's
 * usually soon enough. This is for the times it isn't: standing at five past
 * midnight watching for the record to appear, or wanting a straight answer
 * about why a service is still missing. Same function the tick calls, so the
 * answer is the one the tick would have got.
 */
export const findStoreLinksNow = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const { fillStoreLinks, storefrontFromLocale } = await import('$lib/server/store-links');
  const { getSettings } = await import('$lib/server/settings');

  const settings = await getSettings();
  const filled = await fillStoreLinks(id, storefrontFromLocale(settings?.locale));

  return { filled };
});
