import { db } from '$lib/server/db';
import { integrations } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

// Auth is handled by parent +layout.server.ts
export const load: PageServerLoad = async () => {
	const allIntegrations = await db.select().from(integrations);

	return {
		integrations: allIntegrations
	};
};
