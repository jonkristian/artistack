import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { profile, links, tourDates, media } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { asc, desc, eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		throw redirect(302, '/login');
	}

	// Get user with role from database
	const [userData] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);

	const [profileData] = await db.select().from(profile).limit(1);
	const allLinks = await db.select().from(links).orderBy(asc(links.position));
	const allTourDates = await db.select().from(tourDates).orderBy(asc(tourDates.date));
	const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

	return {
		user: {
			...session.user,
			role: userData?.role ?? 'editor'
		},
		profile: profileData ?? null,
		links: allLinks,
		tourDates: allTourDates,
		media: allMedia
	};
};
