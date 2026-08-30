import { db } from '$lib/server/db';
import { subscribers } from '$lib/server/schema';
import { requireFeature } from '$lib/server/guards';
import { asc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * The list, as a file you can take elsewhere.
 *
 * The point of owning the addresses is being able to leave with them, so this
 * is deliberately plain CSV rather than anything that needs Artistack to read
 * it. Unsubscribed rows are included with their date: a suppression list is
 * something the next tool needs, not something to quietly drop.
 */
export const GET: RequestHandler = async ({ request }) => {
  await requireFeature(request, 'subscribersEnabled');

  const rows = await db.select().from(subscribers).orderBy(asc(subscribers.createdAt));

  const escape = (value: string | null) => {
    if (value == null) return '';
    // Quote always: a name with a comma in it is otherwise a new column.
    return `"${value.replace(/"/g, '""')}"`;
  };
  const iso = (date: Date | null) => (date ? date.toISOString() : '');

  const csv = [
    'email,name,source,country,consent_at,unsubscribed_at',
    ...rows.map((row) =>
      [
        escape(row.email),
        escape(row.name),
        escape(row.source),
        escape(row.country),
        escape(iso(row.consentAt)),
        escape(iso(row.unsubscribedAt))
      ].join(',')
    )
  ].join('\n');

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="subscribers-${stamp}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
};
