import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clipPosts, clipProjects } from '$lib/server/schema';
import { verifyPublishSignature } from '$lib/server/clip-queue';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * Callback for the publishing workflow to report where a clip landed.
 *
 * Artistack fires the outbound publish webhook and, until this existed, learned
 * nothing more — "published" meant "the webhook returned 200", not "it is live
 * on Instagram". n8n owns the platform credentials and the API quirks; this is
 * how the result comes back so the clip carries its own history.
 *
 *   POST /api/clips/12/published
 *   X-Artistack-Signature: sha256=<hmac of the raw body>
 *   { "platform": "instagram", "status": "live", "url": "https://..." }
 *
 * One row per platform per clip — calling twice for the same platform updates
 * rather than accumulating, so a retry after a failure reads as fixed.
 */
export const POST: RequestHandler = async ({ request, params }) => {
  // Read the body as text: the signature covers the raw bytes, and parsing
  // first would verify a re-serialised string that may not match.
  const raw = await request.text();

  if (!(await verifyPublishSignature(raw, request.headers.get('x-artistack-signature')))) {
    throw error(401, 'Invalid or missing signature');
  }

  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) throw error(400, 'Invalid clip id');

  let body: { platform?: unknown; status?: unknown; url?: unknown; error?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    throw error(400, 'Body is not valid JSON');
  }

  const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
  if (!platform) throw error(400, 'platform is required');

  const status: 'live' | 'failed' = body.status === 'failed' ? 'failed' : 'live';
  const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;
  const message = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : null;

  const [project] = await db
    .select({ id: clipProjects.id })
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);
  if (!project) throw error(404, 'Clip not found');

  const existing = await db
    .select({ id: clipPosts.id })
    .from(clipPosts)
    .where(and(eq(clipPosts.projectId, projectId), eq(clipPosts.platform, platform)))
    .limit(1);

  const values = { status, url, error: message, postedAt: new Date() };

  if (existing.length) {
    await db.update(clipPosts).set(values).where(eq(clipPosts.id, existing[0].id));
  } else {
    await db.insert(clipPosts).values({ projectId, platform, ...values });
  }

  return json({ success: true });
};
