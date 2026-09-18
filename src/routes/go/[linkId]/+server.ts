import { redirect, error, type RequestEvent } from '@sveltejs/kit';
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
import { sendMetaConversion } from '$lib/server/pixels';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { params, request, url, cookies } = event;
  const linkId = parseInt(params.linkId, 10);

  if (isNaN(linkId)) {
    throw error(400, 'Invalid link ID');
  }

  // Fetch the link
  const [link] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);

  if (!link) {
    throw error(404, 'Link not found');
  }

  // Track the click (fire and forget), skipping bots and the site's own people.
  const userAgent = request.headers.get('user-agent') || '';

  /*
   * The fan-list email marks its buttons, since a mail client sends no referrer
   * and its clicks would otherwise land in "direct" beside everyone who typed
   * the address. Taken off before forwarding: it's ours, not the store's.
   */
  const fromEmail = url.searchParams.get('src') === 'email';
  const forward = new URLSearchParams(url.searchParams);
  forward.delete('src');

  if (!isBot(userAgent) && !isOwnVisit(request.headers)) {
    trackClick(linkId, event, fromEmail ? 'email' : undefined).catch(() => {});

    /*
     * The conversion an ad platform actually cares about: someone reached a
     * player. Sent from here rather than the browser because this is the one
     * event a blocker can't drop — and because by the time it fires we know
     * which platform they chose.
     *
     * Not awaited. The listener is mid-redirect.
     */
    sendMetaConversion({
      eventName: 'PlatformClick',
      sourceUrl: url.href,
      event
    }).catch(() => {});
  }

  /*
   * Remember which service they chose, so a return visit can lead with it.
   *
   * First-party, functional, and holds nothing but a platform name — no id, no
   * profile, nothing that identifies the visitor or follows them anywhere else.
   * It reorders buttons; it never redirects on its own, because a link that
   * decides where you're going without asking is a link you can't use to reach
   * anywhere else.
   */
  cookies.set('platform', link.platform, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 365
  });

  // Redirect to the actual URL, carrying any query params through.
  throw redirect(302, withQuery(link.url, forward));
};

/**
 * Merge the incoming query string into the destination URL.
 *
 * An ad platform appends its own click ID to whatever link it sends traffic to,
 * and campaign tags ride along the same way — dropping them here is the point
 * where attribution silently breaks, because the destination never sees them
 * and nothing errors. /c/[slug] already forwards its search string; this does
 * the same for a per-link redirect.
 *
 * The destination's own params win: a stored URL that already pins, say, a
 * `si=` on a Spotify link means that value deliberately, so an inbound param of
 * the same name doesn't get to overwrite it.
 */
function withQuery(destination: string, incoming: URLSearchParams): string {
  if (![...incoming].length) return destination;

  try {
    const target = new URL(destination);

    for (const [key, value] of incoming) {
      if (!target.searchParams.has(key)) {
        target.searchParams.append(key, value);
      }
    }

    return target.toString();
  } catch {
    // A stored URL that isn't absolute can't be parsed — send the visitor to it
    // unchanged rather than failing the redirect over a tracking parameter.
    return destination;
  }
}

async function trackClick(linkId: number, event: RequestEvent, source?: string): Promise<void> {
  const referrer = source ?? parseReferrer(event.request.headers.get('referer'));
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
