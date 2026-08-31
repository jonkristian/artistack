import { requireFeature } from '$lib/server/guards';
import { db } from '$lib/server/db';
import { pages } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Only the id is returned. The page itself comes from the layout's copy, which
 * is what the draft is built from — loading the row again here would show
 * saved values next to an editor showing unsaved ones.
 *
 * The lookup still happens, because a bad id has to 404 rather than render an
 * editor with nothing in it.
 */
export const load: PageServerLoad = async ({ params, request }) => {
  await requireFeature(request, 'pagesEnabled');

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    error(404, 'Page not found');
  }

  const [page] = await db.select({ type: pages.type }).from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) {
    error(404, 'Page not found');
  }

  // The front page has its own address, so there's one URL for it rather than
  // two that render the same editor.
  if (page.type === 'landing') {
    redirect(307, '/admin/home');
  }

  /*
   * A release owns a `pages` row too, but it's edited from its own section
   * where its dates and platform links live. Sending it here would offer half
   * an editor.
   */
  if (page.type !== 'custom') {
    error(404, 'Page not found');
  }

  return { pageId: id };
};
