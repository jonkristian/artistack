import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Validation Schemas
// ============================================================================

// Hex color validator (accepts #RGB, #RRGGBB, or #RRGGBBAA formats)
const hexColor = v.pipe(
	v.string(),
	v.regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, 'Invalid hex color format')
);

const appearanceSchema = v.object({
	// Colors - validated as hex colors
	colorBg: v.optional(v.nullable(hexColor)),
	colorCard: v.optional(v.nullable(hexColor)),
	colorAccent: v.optional(v.nullable(hexColor)),
	colorText: v.optional(v.nullable(hexColor)),
	colorTextMuted: v.optional(v.nullable(hexColor)),
	// Display options
	showName: v.optional(v.boolean()),
	showLogo: v.optional(v.boolean()),
	showPhoto: v.optional(v.boolean()),
	showBio: v.optional(v.boolean()),
	showStreaming: v.optional(v.boolean()),
	showSocial: v.optional(v.boolean()),
	showTourDates: v.optional(v.boolean()),
	showPressKit: v.optional(v.boolean()),
	// Layout - restricted to valid options
	layout: v.optional(v.picklist(['default', 'minimal', 'card']))
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
// Appearance Command (for auto-save)
// ============================================================================

export const updateAppearance = command(appearanceSchema, async (data) => {
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
