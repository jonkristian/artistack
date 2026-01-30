import { db } from '$lib/server/db';
import { profile, links, tourDates } from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { eq, asc } from 'drizzle-orm';

export async function load({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	const [artistProfile] = await db.select().from(profile).limit(1);
	const artistLinks = await db.select().from(links).where(eq(links.visible, true)).orderBy(asc(links.position));
	const artistTourDates = await db.select().from(tourDates).orderBy(asc(tourDates.date));

	return {
		profile: artistProfile ?? null,
		links: artistLinks,
		tourDates: artistTourDates,
		user: session?.user ?? null
	};
}
