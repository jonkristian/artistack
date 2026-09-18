import { redirect } from '@sveltejs/kit';
import { isBot, isOwnVisit, recordPageView, COUNTED_COOKIE } from '$lib/server/tracking';
import type { RequestHandler } from './$types';

/**
 * Campaign redirect for clip call-to-action links.
 *
 * A generated clip's post sheet points at /c/<slug> rather than the bare site
 * URL, so traffic can be attributed to the clip that drove it — the slug shows
 * up in the stats page's paths alongside everything else.
 *
 * The hit is recorded here rather than left to the request hook, because the
 * hook only tracks responses with status 200 and this route always redirects.
 *
 * Unknown slugs redirect too: a typo in a caption that's already been posted
 * should still land the visitor on the page, not on a 404.
 */
export const GET: RequestHandler = async (event) => {
  const { params, request, url } = event;
  const userAgent = request.headers.get('user-agent') || '';

  if (!isBot(userAgent) && !isOwnVisit(request.headers)) {
    // Fire and forget, like the hook does — analytics shouldn't delay the redirect.
    recordPageView(event, `/c/${params.slug}`, userAgent, url.hostname).catch(() => {
      // Silently ignore tracking errors
    });

    // The front page would count this visit again when it lands. A minute is
    // long enough to arrive and short enough not to swallow a later visit.
    event.cookies.set(COUNTED_COOKIE, '1', {
      path: '/',
      maxAge: 60,
      httpOnly: true,
      sameSite: 'lax'
    });
  }

  // Preserve any extra query params (a platform's own click IDs, say).
  redirect(302, url.search ? `/${url.search}` : '/');
};
