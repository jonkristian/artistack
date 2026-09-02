import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { integrations, settings } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import {
  getSpotifyConfig,
  getCachedSocialStats,
  getDetectedPlatformIds,
  getGoogleConfig
} from '$lib/server/social-stats';
import type { SpotifyConfig } from '$lib/server/social-stats';
import {
  getDiscordSettings,
  getClipSettings,
  getMetaSettings,
  getTiktokSettings,
  getClipPublishingSettings,
  getSettings,
  getSetting
} from '$lib/server/settings';
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
      getSpotifyConfig(),
      getGoogleConfig(),
      getCachedSocialStats(),
      getDetectedPlatformIds(),
      getSettings()
    ]);

  // Each feature's config now lives beside the feature. This route is
  // admin-only, so it reads the ones its panels edit.
  const [discord, clips, publishing, meta, tiktok] = await Promise.all([
    getDiscordSettings(),
    getClipSettings(),
    getClipPublishingSettings(),
    getMetaSettings(),
    getTiktokSettings()
  ]);
  const pixels = {
    metaPixelId: meta.pixelId,
    metaCapiToken: meta.capiToken,
    tiktokPixelId: tiktok.pixelId
  };
  const clipConfig = { ...clips, ...publishing };

  /*
   * The payment secrets never leave the server, not even to this admin-only
   * page. What the form needs is whether they're set, and the two identifiers
   * that are useless on their own — a client secret in the HTML is a client
   * secret in someone's browser history.
   */
  const paymentSettings = await getSetting('payments');
  const payments = {
    testMode: paymentSettings.testMode,
    testCheckout: paymentSettings.testCheckout,
    vippsClientId: paymentSettings.vippsClientId,
    vippsMerchantSerialNumber: paymentSettings.vippsMerchantSerialNumber,
    hasVippsClientSecret: !!paymentSettings.vippsClientSecret,
    hasVippsSubscriptionKey: !!paymentSettings.vippsSubscriptionKey,
    paypalClientId: paymentSettings.paypalClientId,
    hasPaypalClientSecret: !!paymentSettings.paypalClientSecret
  };

  return {
    integrations: allIntegrations,
    spotifyConfig: spotifyConfig ?? null,
    googleConfig: googleConfig ?? null,
    socialStats,
    detectedIds,
    settings: settingsData,
    discord,
    clips: clipConfig,
    pixels,
    payments
  };
};
