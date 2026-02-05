import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const currentSettings = await db.select().from(settings).get();

	return {
		settings: currentSettings
	};
};
