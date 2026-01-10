import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Validation Schemas
// ============================================================================

const settingsSchema = v.object({
	locale: v.optional(v.string()),
	googlePlacesApiKey: v.optional(v.nullable(v.string()))
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getOrCreateProfile() {
	const [existing] = await db.select().from(profile).limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(profile)
		.values({ name: 'Artist Name' })
		.returning();
	return created;
}

// ============================================================================
// Settings Command (for auto-save)
// ============================================================================

export const updateSettings = command(settingsSchema, async (data) => {
	const existing = await getOrCreateProfile();

	// Filter out undefined values
	const updates: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (value !== undefined) {
			updates[key] = value;
		}
	}

	const [updated] = await db
		.update(profile)
		.set(updates)
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});
