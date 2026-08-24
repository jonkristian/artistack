import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, userInvite } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  // Verify admin role - only admins can manage users
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      createdAt: user.createdAt
    })
    .from(user)
    .orderBy(asc(user.name));

  // Who hasn't turned up yet. An outstanding invite, not the absence of a
  // password, is the signal — someone can be re-invited after they've joined.
  const pending = await db
    .select({ userId: userInvite.userId, expiresAt: userInvite.expiresAt })
    .from(userInvite)
    .where(and(isNull(userInvite.acceptedAt), gt(userInvite.expiresAt, new Date())));

  return {
    users,
    pendingIds: pending.map((p) => p.userId)
  };
};
