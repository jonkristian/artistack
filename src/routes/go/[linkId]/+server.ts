import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { links, linkClicks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { isBot, parseReferrer, getClientIP, lookupCountry } from '$lib/server/tracking';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
  const linkId = parseInt(params.linkId, 10);

  if (isNaN(linkId)) {
    throw error(400, 'Invalid link ID');
  }

  // Fetch the link
  const [link] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);

  if (!link) {
    throw error(404, 'Link not found');
  }

  // Track the click (fire and forget, skip bots)
  const userAgent = request.headers.get('user-agent') || '';

  if (!isBot(userAgent)) {
    trackClick(linkId, request).catch(() => {});
  }

  // Redirect to the actual URL
  throw redirect(302, link.url);
};

async function trackClick(linkId: number, request: Request): Promise<void> {
  const referrer = parseReferrer(request.headers.get('referer'));
  const ip = getClientIP(request);
  const country = ip ? await lookupCountry(ip) : null;

  await db.insert(linkClicks).values({
    linkId,
    referrer,
    country
  });
}
