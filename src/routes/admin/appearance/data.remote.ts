import { requireAdmin } from '$lib/server/guards';
import {
  getSettings,
  updateSiteSettings,
  getColorSchemes,
  saveColorScheme,
  deleteColorScheme
} from '$lib/server/settings';
import * as v from 'valibot';
import { FONTS } from '$lib/fonts';
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

/** The ids a setting may hold, taken from the list rather than retyped. */
const FONT_IDS = FONTS.map((f) => f.id) as [string, ...string[]];

const appearanceSchema = v.object({
  // Colors - validated as hex colors
  colorBg: v.optional(v.nullable(hexColor)),
  colorCard: v.optional(v.nullable(hexColor)),
  colorAccent: v.optional(v.nullable(hexColor)),
  colorText: v.optional(v.nullable(hexColor)),
  colorTextMuted: v.optional(v.nullable(hexColor)),
  colorIcon: v.optional(v.nullable(hexColor)),
  // The faces, as ids from the font list. Empty for the heading means it
  // follows the body, which is what most sites want and all of them start as.
  fontBody: v.optional(v.picklist(FONT_IDS)),
  fontHeading: v.optional(v.picklist(['', ...FONT_IDS])),
  // Layout - restricted to valid options
  layout: v.optional(v.picklist(['default', 'simple'])),
  // UI options
  showShareButton: v.optional(v.boolean()),
  showPressKit: v.optional(v.boolean())
});

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Appearance Command (for auto-save)
// ============================================================================

export const updateAppearance = command(appearanceSchema, async (data) => {
  await requireAdmin();

  // Filter out undefined values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  await updateSiteSettings(updates);

  return { success: true };
});

// ============================================================================
// Colour schemes
// ============================================================================

const paletteSchema = v.object({
  colorBg: hexColor,
  colorCard: hexColor,
  colorAccent: hexColor,
  colorText: hexColor,
  colorTextMuted: hexColor,
  colorIcon: hexColor
});

/**
 * Save the palette you're looking at under a name.
 *
 * Takes the palette rather than reading the stored one, because the colours
 * being saved are usually the unpublished ones in the draft — you tweak, decide
 * you like it, and name it before committing.
 */
export const saveScheme = command(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name the scheme')),
    palette: paletteSchema
  }),
  async ({ name, palette }) => {
    await requireAdmin();
    await saveColorScheme(name, palette);
    return { success: true, schemes: (await getColorSchemes()).schemes };
  }
);

export const removeScheme = command(
  v.object({ name: v.pipe(v.string(), v.nonEmpty()) }),
  async ({ name }) => {
    await requireAdmin();
    await deleteColorScheme(name);
    return { success: true, schemes: (await getColorSchemes()).schemes };
  }
);
