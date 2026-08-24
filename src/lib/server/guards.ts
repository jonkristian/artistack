import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { user } from './auth-schema';
import { auth } from './auth';

/**
 * Guards for remote functions.
 *
 * A page's load function does not run when the browser calls a remote function
 * — the call goes straight to the function. So a route guard on `+page.server.ts`
 * says nothing about who can invoke the writes that page performs; each one has
 * to check for itself.
 *
 * Two levels, matching the two roles:
 *   requireUser  — signed in at all. Content work: the page, media, clips.
 *   requireAdmin — the things that let you reach outside the band or change who
 *                  is in it: integration secrets, SMTP, site settings, users.
 */

async function currentUser() {
  const session = await auth.api.getSession({ headers: getRequestEvent().request.headers });
  if (!session?.user) {
    throw error(401, 'Not signed in');
  }

  // The role lives in the database, not the session, so it can't go stale after
  // an admin changes it.
  const [row] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (!row) {
    throw error(401, 'Not signed in');
  }

  return row;
}

export async function requireUser() {
  return currentUser();
}

export async function requireAdmin() {
  const me = await currentUser();
  if (me.role !== 'admin') {
    throw error(403, 'Admins only');
  }
  return me;
}
