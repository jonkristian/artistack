import { redirect } from '@sveltejs/kit';
import { isBot, recordPageView } from '$lib/server/tracking';
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
export const GET: RequestHandler = async ({ params, request, url }) => {
  const userAgent = request.headers.get('user-agent') || '';

  if (!isBot(userAgent)) {
    // Fire and forget, like the hook does — analytics shouldn't delay the redirect.
    recordPageView(request, `/c/${params.slug}`, userAgent, url.hostname).catch(() => {
      // Silently ignore tracking errors
    });
  }

  // Preserve any extra query params (a platform's own click IDs, say).
  redirect(302, url.search ? `/${url.search}` : '/');
};
