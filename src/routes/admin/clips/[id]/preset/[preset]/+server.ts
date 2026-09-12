import { error, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { getSettings } from '$lib/server/settings';
import { clipSwatch } from '$lib/server/clip-swatch';
import { previewFilters } from '$lib/server/clip-render';
import { CLIP_PRESETS } from '$lib/clips/types';
import type { RequestHandler } from './$types';

/** A still of this clip's footage with one preset's look on it. */
export const GET: RequestHandler = async ({ request, params }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect(302, '/login');

  const siteSettings = await getSettings();
  if (!siteSettings?.clipsEnabled) throw error(404, 'Not found');

  const preset = CLIP_PRESETS.find((p) => p.id === params.preset);
  if (!preset) throw error(404, 'Unknown preset');

  return clipSwatch(Number(params.id), preset.id, previewFilters(preset.config));
};
