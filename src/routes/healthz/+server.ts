import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * Liveness probe for the container orchestrator.
 *
 * Exists so the healthcheck isn't `GET /`, which renders the whole homepage —
 * profile, blocks, links, tour dates — every few seconds just to prove the
 * process is up.
 *
 * It touches the database on purpose: a Node process that is running but can't
 * reach its database serves errors, and a probe that only proved the port was
 * open would call that healthy. It deliberately does NOT check ffmpeg — a box
 * without it can still serve the site perfectly well, and failing the probe
 * would take the whole site down over a feature most visitors never touch.
 */
export const GET: RequestHandler = async () => {
  try {
    db.get(sql`select 1`);
    return new Response('OK', {
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
    });
  } catch {
    return new Response('DB_UNAVAILABLE', {
      status: 503,
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
    });
  }
};
