import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { getIdentitySettings } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  // Admins only, like the rest of Settings.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  return { identity: await getIdentitySettings() };
};
