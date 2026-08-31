import { db } from './db';
import { pages, type PageType } from './schema';
import { eq } from 'drizzle-orm';
import { validateSlug, SLUG_ERROR_MESSAGES, slugify } from '$lib/utils/slug';
import { error } from '@sveltejs/kit';

/**
 * Claiming an address in `pages`.
 *
 * Four things own a `pages` row now — the front page, a release, an ordinary
 * page, a show — and each of them was about to repeat the same twenty lines:
 * slugify, validate, check nothing else is there, insert. One copy, so a fix to
 * the reserved list or the clash message reaches all of them.
 */

/** Slugify and validate, or fail with the message the user should see. */
export function toSlug(candidate: string): string {
  const slug = slugify(candidate);
  const slugError = validateSlug(slug);
  if (slugError) {
    error(400, SLUG_ERROR_MESSAGES[slugError]);
  }
  return slug;
}

/**
 * A slug nothing else has taken.
 *
 * Suffixes rather than refusing, because the caller here is deriving one — a
 * second gig at the same venue is `kvarteret-2` rather than an error about an
 * address the person never typed. Where someone *chose* the slug, use
 * `claimSlug`, which tells them it's taken.
 */
export async function uniqueSlug(candidate: string): Promise<string> {
  const base = toSlug(candidate);

  for (let n = 1; ; n++) {
    const attempt = n === 1 ? base : `${base}-${n}`;
    const [clash] = await db.select().from(pages).where(eq(pages.slug, attempt)).limit(1);
    if (!clash) return attempt;
  }
}

/** Fails if the address is taken. For a slug someone typed on purpose. */
export async function claimSlug(candidate: string): Promise<string> {
  const slug = toSlug(candidate);

  const [clash] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (clash) {
    error(400, 'Something already lives at that address.');
  }
  return slug;
}

/**
 * Create the row that owns an address.
 *
 * Unpublished by default: a page discoverable the moment it's created would be
 * found before anything had been filled in.
 */
export async function createPageRow(opts: {
  slug: string;
  title: string;
  type: PageType;
  published?: boolean;
}) {
  const [page] = await db
    .insert(pages)
    .values({
      slug: opts.slug,
      title: opts.title,
      type: opts.type,
      published: opts.published ?? false
    })
    .returning();

  return page;
}
