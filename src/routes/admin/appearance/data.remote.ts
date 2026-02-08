import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
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
  // Layout - restricted to valid options
  layout: v.optional(v.picklist(['default', 'minimal', 'card'])),
  // UI options
  showShareButton: v.optional(v.boolean()),
  showPressKit: v.optional(v.boolean())
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(settings).values({}).returning();
  return created;
}

// ============================================================================
// Appearance Command (for auto-save)
// ============================================================================

export const updateAppearance = command(appearanceSchema, async (data) => {
  const existing = await getOrCreateSettings();

  // Filter out undefined values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const [updated] = await db
    .update(settings)
    .set(updates)
    .where(eq(settings.id, existing.id))
    .returning();

  return { success: true, settings: updated };
});
