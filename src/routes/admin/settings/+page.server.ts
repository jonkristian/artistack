import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
	// Verify admin role - only admins can manage settings
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw redirect(302, '/login');
	}

	const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
	if (currentUser?.role !== 'admin') {
		throw redirect(302, '/admin');
	}

	const currentProfile = await db.select().from(profile).get();

	return {
		profile: currentProfile
	};
};
