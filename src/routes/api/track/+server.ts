import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { linkClicks } from '$lib/server/schema';
import {
  isBot,
  parseReferrer,
  getClientIP,
  lookupCountry,
  deviceFromUserAgent
} from '$lib/server/tracking';
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

export const POST: RequestHandler = async ({ request }) => {
  const userAgent = request.headers.get('user-agent') || '';

  // Skip bots
  if (isBot(userAgent)) {
    return json({ success: true });
  }

  try {
    const body = await request.json();
    const linkId = parseInt(body.linkId, 10);

    if (isNaN(linkId)) {
      return json({ success: false, error: 'Invalid link ID' }, { status: 400 });
    }

    // Track asynchronously - don't wait
    trackClick(linkId, request).catch(() => {
      // Silently ignore
    });

    return json({ success: true });
  } catch {
    return json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
};

async function trackClick(linkId: number, request: Request): Promise<void> {
  const referrer = parseReferrer(request.headers.get('referer'));
  const ip = getClientIP(request);
  const country = ip ? await lookupCountry(ip) : null;
  const device = deviceFromUserAgent(request.headers.get('user-agent') || '');

  await db.insert(linkClicks).values({
    linkId,
    referrer,
    country,
    device
  });
}
