import { error, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { getSettings } from '$lib/server/settings';
import { clipSwatch } from '$lib/server/clip-swatch';
import { previewFilters } from '$lib/server/clip-render';
import { pictureEffectById } from '$lib/clips/effects';
import type { RequestHandler } from './$types';

/**
 * A still of this clip's footage with one footage effect on it.
 *
 * The same swatch the preset tiles use, asked of an effect instead — so the
 * picker can show what a look does to your footage rather than describing it in
 * a sentence and leaving you to render to find out.
 *
 * Only the part of a look that survives a single frame: `previewFilters` drops
 * anything needing motion, which is why Signal loss has no swatch. A still of a
 * tear is either an untouched frame or the worst one in the clip, and neither
 * is what it looks like.
 */
export const GET: RequestHandler = async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect(302, '/login');

  const siteSettings = await getSettings();
  if (!siteSettings?.clipsEnabled) throw error(404, 'Not found');

  const effect = pictureEffectById(params.effect);
  if (!effect) throw error(404, 'Unknown effect');

  const filters = previewFilters({ effects: [{ id: effect.id }] });
  if (!filters.length) throw error(404, 'Nothing a still can show');

  return clipSwatch(Number(params.id), `fx-${effect.id}`, filters);
};
