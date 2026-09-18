import type { Handle } from '@sveltejs/kit';
import { initScheduler } from '$lib/server/scheduler';
import {
  isBot,
  isOwnVisit,
  isTrackedPath,
  recordPageView,
  COUNTED_COOKIE
} from '$lib/server/tracking';

// Initialize scheduled tasks (runs once on server start)
initScheduler();

/**
 * Headers every response carries.
 *
 * Deliberately the four that cost nothing to be right about:
 *
 *   nosniff          — a served file is what its content type says it is, so a
 *                      mislabelled upload can't be re-read as HTML.
 *   frame-ancestors  — the admin can't be framed by another site and clicked
 *                      through blind. Sent as both CSP and the older header,
 *                      since the two are read by different things.
 *   Referrer-Policy  — an outbound click leaks the origin, not the path. A
 *                      preview or unsubscribe token is in the path.
 *   HSTS             — https only, and only when already on it.
 *
 * There is no `script-src` here on purpose. The public pages carry inline
 * styles, SvelteKit's hydration script, Google Fonts and — when the artist is
 * advertising — Meta's and TikTok's pixels, so a content policy worth having
 * needs nonces threaded through all of it. That is a real piece of work and a
 * real risk of quietly breaking a live site, so it is its own job rather than a
 * line added here. The place it would have mattered most, an uploaded SVG, is
 * closed off at `serveFile` instead.
 */
function secure(response: Response, isHttps: boolean): Response {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  /*
   * Only when the route hasn't said something stricter. `serveFile` sends an
   * uploaded SVG with a policy that permits nothing, and setting this
   * unconditionally replaced it with a policy that permits everything but
   * framing — quietly undoing the fix, since a response carries one CSP and the
   * last writer wins.
   */
  if (!response.headers.has('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  }

  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

export const handle: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent') || '';

  // Read and cleared before resolving, so the clearing reaches the response.
  const countedAlready = event.cookies.get(COUNTED_COOKIE) != null;
  if (countedAlready) event.cookies.delete(COUNTED_COOKIE, { path: '/' });

  // Always resolve the request first for better performance
  const response = secure(await resolve(event), url.protocol === 'https:');

  // Only track page views for successful HTML responses
  if (response.status !== 200) {
    return response;
  }

  // Skip tracking for bots, admin routes, static files, etc.
  if (!isTrackedPath(path) || isBot(userAgent)) {
    return response;
  }

  // Someone signed in is working on the site, not visiting it — and that's
  // mostly drafts and previews, which would otherwise count as the audience.
  if (isOwnVisit(request.headers)) {
    return response;
  }

  // A campaign link has already counted this visit, as itself, on its way here.
  if (countedAlready) {
    return response;
  }

  // Don't await the tracking - fire and forget for better performance
  recordPageView(event, path, userAgent, url.hostname).catch(() => {
    // Silently ignore tracking errors
  });

  return response;
};
