import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { pages, blocks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { claimSlug, createPageRow, toSlug } from '$lib/server/page-slug';
import { error } from '@sveltejs/kit';

/**
 * Ordinary pages: an address and a stack of blocks, nothing more.
 *
 * Releases and the shop also own a `pages` row, but they're created from their
 * own sections because a release is a release before it's a URL. What's left
 * here is the page that is only ever a page — an about, a contact, a EPK.
 */

const createSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the page a title')),
  slug: v.optional(v.string())
});

export const createPage = command(createSchema, async ({ title, slug }) => {
  await requireUser();

  const candidate = await claimSlug(slug?.trim() || title);

  // Unpublished by default, like a release: an empty page discoverable the
  // moment it's named is worse than one nobody can reach yet.
  const page = await createPageRow({ slug: candidate, title, type: 'custom' });

  return { id: page.id, slug: page.slug };
});

const updateSchema = v.object({
  id: v.number(),
  title: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty('Give the page a title'))),
  slug: v.optional(v.string()),
  description: v.optional(v.nullable(v.string())),
  published: v.optional(v.boolean())
});

export const updatePage = command(updateSchema, async ({ id, slug, ...rest }) => {
  await requireUser();

  const [page] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) {
    error(404, 'That page no longer exists.');
  }

  const changes: Partial<typeof pages.$inferInsert> = { ...rest };

  if (slug !== undefined) {
    /*
     * The landing page renders at `/` and its slug is an internal handle, so
     * there's no address to change. Letting it be edited would offer a URL
     * that never resolves.
     */
    if (page.type === 'landing') {
      error(400, 'The front page lives at the root of the site and has no address to change.');
    }

    const candidate = toSlug(slug.trim());

    if (candidate !== page.slug) {
      const [clash] = await db.select().from(pages).where(eq(pages.slug, candidate)).limit(1);
      if (clash) {
        error(400, 'Something already lives at that address.');
      }
      changes.slug = candidate;
    }
  }

  await db.update(pages).set(changes).where(eq(pages.id, id));

  return { success: true };
});

export const deletePage = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [page] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) {
    error(404, 'That page no longer exists.');
  }

  // Exactly one landing page exists and the site has nothing to render at `/`
  // without it. The list hides the control; this is the check that matters.
  if (page.type === 'landing') {
    error(400, 'The front page cannot be deleted.');
  }

  /*
   * Only ordinary pages are deletable from here. A release owns rows in
   * `releases` and `links` that this would leave behind, so it's deleted from
   * its own section where that's handled.
   */
  if (page.type !== 'custom') {
    error(400, 'This page belongs to another section and has to be deleted there.');
  }

  await db.delete(blocks).where(eq(blocks.pageId, id));
  await db.delete(pages).where(eq(pages.id, id));

  return { success: true };
});
