import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const currentProfile = await db.select().from(profile).get();

	return {
		profile: currentProfile
	};
};
