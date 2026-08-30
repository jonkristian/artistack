import { db } from '$lib/server/db';
import { pages as pagesTable } from '$lib/server/schema';
import { eq, and, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * Built from the pages table rather than a hardcoded list, so a page that goes
 * live is discoverable without a code change.
 *
 * Unpublished pages are omitted: a draft is reachable by URL for whoever is
 * logged in, but advertising it to crawlers would leak an unreleased page.
 */
export const GET: RequestHandler = async ({ url }) => {
  const published = await db
    .select()
    .from(pagesTable)
    .where(and(eq(pagesTable.published, true), ne(pagesTable.type, 'landing')));

  const entries = [
    // The artist page is the root, not its slug.
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    ...published.map((page) => ({
      path: `/${page.slug}`,
      priority: page.type === 'release' ? '0.9' : '0.7',
      changefreq: 'weekly'
    }))
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${url.origin}${entry.path}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
