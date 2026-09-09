import * as v from 'valibot';
import { command } from '$app/server';
import { requireAdmin } from '$lib/server/guards';
import { toggleBrandColor } from '$lib/server/settings';

/*
 * The shelf of kept colours, reachable from any picker.
 *
 * In `$lib` rather than under `appearance/`, because keeping a colour is not
 * something the appearance screen does — it's something a colour picker does,
 * and there is one on a caption block as well.
 */
const hexColor = v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'));

/** Keeps the colour, or stops keeping it if it's already there. */
export const keepColor = command(hexColor, async (color) => {
  await requireAdmin();
  return { success: true, colors: await toggleBrandColor(color) };
});
