import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { integrations } from '$lib/server/schema';
import { requireAuth } from '$lib/server/api';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	await requireAuth(request);

	const allIntegrations = await db.select().from(integrations);
	return json(allIntegrations);
};

export const POST: RequestHandler = async ({ request }) => {
	await requireAuth(request);

	const { provider, config, enabled } = await request.json();

	// Check if integration exists
	const [existing] = await db
		.select()
		.from(integrations)
		.where(eq(integrations.provider, provider));

	if (existing) {
		// Update existing
		const [updated] = await db
			.update(integrations)
			.set({ config, enabled })
			.where(eq(integrations.provider, provider))
			.returning();
		return json(updated);
	}

	// Create new
	const [created] = await db
		.insert(integrations)
		.values({ provider, config, enabled })
		.returning();

	return json(created);
};

export const PATCH: RequestHandler = async ({ request, url }) => {
	await requireAuth(request);

	const provider = url.searchParams.get('provider');
	if (!provider) {
		throw error(400, 'Provider required');
	}

	const action = url.searchParams.get('action');

	// Future: handle sync for other providers like Facebook, Bandsintown
	throw error(400, 'Unsupported provider or action');
};
