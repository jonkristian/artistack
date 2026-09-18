import { json } from '@sveltejs/kit';
import {
  isBot,
  isOwnVisit,
  isTrackedPath,
  recordPageView,
  getClientIP
} from '$lib/server/tracking';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

/**
 * A page view for a page reached without a page load.
 *
 * After the first page, SvelteKit moves between pages by fetching their data,
 * which the request hook rightly ignores — so only the page someone landed on
 * was ever counted. A release opened from the front page, the commonest route
 * to one, didn't exist in the stats. The browser reports those here instead.
 *
 * Same rules as the hook: same paths, same bot and own-visit checks, same row.
 */

/** A browsing session is a few dozen pages at most; this bounds a script. */
const VIEWS_PER_HOUR = 300;

/** A page's address, not anything else someone might post here. */
const PAGE_PATH = /^\/[a-z0-9\-/]{0,200}$/i;

export const POST: RequestHandler = async (event) => {
  const { request, url } = event;
  const userAgent = request.headers.get('user-agent') || '';

  // Answered the same whatever happens: the beacon never reads the reply.
  const done = new Response(null, { status: 204 });

  if (isBot(userAgent) || isOwnVisit(request.headers)) return done;

  const ip = getClientIP(event);
  if (!rateLimit(`view:${ip ?? 'unknown'}`, VIEWS_PER_HOUR, 60 * 60 * 1000).allowed) return done;

  let path: unknown;
  try {
    ({ path } = await request.json());
  } catch {
    return json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof path !== 'string' || !PAGE_PATH.test(path) || !isTrackedPath(path)) return done;

  recordPageView(event, path, userAgent, url.hostname).catch(() => {
    // Silently ignore tracking errors
  });

  return done;
};
