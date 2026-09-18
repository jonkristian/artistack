import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shows } from '$lib/server/schema';
import { isBot, isOwnVisit, recordAction } from '$lib/server/tracking';
import type { RequestHandler } from './$types';

/** A show's ticket button, counted on its way to the ticket seller. */
export const GET: RequestHandler = async (event) => {
  const id = Number(event.params.showId);
  if (!Number.isInteger(id)) error(400, 'Invalid show');

  const [show] = await db
    .select({ ticketUrl: shows.ticketUrl })
    .from(shows)
    .where(eq(shows.id, id))
    .limit(1);
  if (!show?.ticketUrl) error(404, 'No tickets for this show');

  const { request } = event;
  if (!isBot(request.headers.get('user-agent') || '') && !isOwnVisit(request.headers)) {
    // Not awaited: the buyer is mid-redirect.
    recordAction(event, 'tickets', id).catch(() => {});
  }

  redirect(302, show.ticketUrl);
};
