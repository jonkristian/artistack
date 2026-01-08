import { db } from '$lib/server/db';
import { media } from '$lib/server/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

	return {
		media: allMedia
	};
};
