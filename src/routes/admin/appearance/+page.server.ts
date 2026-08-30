import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import { getColorSchemes } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

// The look of the site is the artist's identity, not day-to-day content work,
// so it sits with the other admin-only settings. The page's data comes from the
// admin layout; this exists purely to turn editors away.
export const load: PageServerLoad = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  return { schemes: (await getColorSchemes()).schemes };
};
