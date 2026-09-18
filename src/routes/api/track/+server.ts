import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { links, linkClicks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import {
  isBot,
  isOwnVisit,
  parseReferrer,
  getClientIP,
  lookupCountry,
  deviceFromUserAgent
} from '$lib/server/tracking';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Click beacon for links rendered inside a block, sent by
 * $lib/blocks/utils.ts.
 *
 * The helpers come from server/tracking rather than being repeated here. They
 * were repeated, with a shorter bot list and a referrer format of their own, so
 * the same `link_clicks` column was being written two different ways depending
 * on whether a click arrived through /go or through this beacon.
 */

/**
 * Generous, because this fires on real clicks and a page of links can produce a
 * handful in a few seconds. It is here to bound what an unauthenticated caller
 * can write to the table, not to police anyone's browsing.
 */
const CLICKS_PER_HOUR = 300;

export const POST: RequestHandler = async (event) => {
  const { request } = event;
  const userAgent = request.headers.get('user-agent') || '';

  // Skip bots, and the site's own people testing their links
  if (isBot(userAgent) || isOwnVisit(request.headers)) {
    return json({ success: true });
  }

  /*
   * Answered as though it worked. This endpoint tells the caller nothing and
   * the browser does nothing with the reply, so a throttled script gets no
   * signal — unlike the sign-up form, where a person needs to be told.
   */
  const ip = getClientIP(event);
  if (!rateLimit(`track:${ip ?? 'unknown'}`, CLICKS_PER_HOUR, 60 * 60 * 1000).allowed) {
    return json({ success: true });
  }

  try {
    const body = await request.json();
    const linkId = parseInt(body.linkId, 10);

    if (isNaN(linkId)) {
      return json({ success: false, error: 'Invalid link ID' }, { status: 400 });
    }

    // Track asynchronously - don't wait
    trackClick(linkId, event).catch(() => {
      // Silently ignore
    });

    return json({ success: true });
  } catch {
    return json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
};

async function trackClick(linkId: number, event: RequestEvent): Promise<void> {
  /*
   * The link has to exist. SQLite is not enforcing foreign keys here, so
   * without this an open endpoint could fill the table with clicks on links
   * that never existed — rows nothing can ever join back to, in the middle of
   * the stats the artist reads.
   */
  const [link] = await db.select({ id: links.id }).from(links).where(eq(links.id, linkId)).limit(1);
  if (!link) return;

  const referrer = parseReferrer(event.request.headers.get('referer'));
  const ip = getClientIP(event);
  const country = ip ? await lookupCountry(ip) : null;
  const device = deviceFromUserAgent(event.request.headers.get('user-agent') || '');

  await db.insert(linkClicks).values({
    linkId,
    referrer,
    country,
    device
  });
}
