import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { integrations, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import {
  getIntegrationConfig,
  getCachedSocialStats,
  getDetectedPlatformIds,
  getGoogleConfig
} from '$lib/server/social-stats';
import type { SpotifyConfig, GoogleConfig } from '$lib/server/social-stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  // Verify admin role - only admins can manage integrations
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect(302, '/login');
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  if (currentUser?.role !== 'admin') {
    throw redirect(302, '/admin');
  }

  const [allIntegrations, spotifyConfig, googleConfig, socialStats, detectedIds, settingsData] =
    await Promise.all([
      db.select().from(integrations),
      getIntegrationConfig('spotify') as Promise<SpotifyConfig | null>,
      getGoogleConfig(),
      getCachedSocialStats(),
      getDetectedPlatformIds(),
      db.select().from(settings).limit(1)
    ]);

  return {
    integrations: allIntegrations,
    spotifyConfig: spotifyConfig ?? null,
    googleConfig: googleConfig ?? null,
    socialStats,
    detectedIds,
    settings: settingsData[0] ?? null
  };
};
