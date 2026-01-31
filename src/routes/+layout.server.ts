import { db } from '$lib/server/db';
import { profile, links, tourDates } from '$lib/server/schema';
import { auth } from '$lib/server/auth';
import { eq, asc } from 'drizzle-orm';
import { existsSync } from 'fs';
import { join } from 'path';

export async function load({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	const [artistProfile] = await db.select().from(profile).limit(1);
	const artistLinks = await db.select().from(links).where(eq(links.visible, true)).orderBy(asc(links.position));
	const artistTourDates = await db.select().from(tourDates).orderBy(asc(tourDates.date));

	// Check if press kit exists and is enabled
	const pressKitPath = join(process.cwd(), 'data', 'uploads', 'press-kit.zip');
	const pressKitAvailable = artistProfile?.showPressKit && existsSync(pressKitPath);

	return {
		profile: artistProfile ?? null,
		links: artistLinks,
		tourDates: artistTourDates,
		pressKitAvailable,
		user: session?.user ?? null
	};
}
