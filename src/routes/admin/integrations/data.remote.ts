import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { sendDiscordReport } from '$lib/server/discord';
import { getOverviewStats, getPageViewStats, getLinkClickStats } from '$lib/server/analytics';
import {
	updateIntegrationConfig,
	fetchSpotifyArtistStats,
	fetchYouTubeChannelStats,
	updateIntegrationCache,
	getCachedSocialStats,
	detectSpotifyArtistFromLinks,
	detectYouTubeChannelFromLinks,
	updateGoogleConfig,
	type SpotifyConfig,
	type YouTubeConfig,
	type GoogleConfig
} from '$lib/server/social-stats';

// ============================================================================
// Validation Schemas
// ============================================================================

// Artist ID is auto-detected from links - only API credentials needed
const spotifyConfigSchema = v.object({
	clientId: v.pipe(v.string(), v.minLength(1, 'Client ID is required')),
	clientSecret: v.pipe(v.string(), v.minLength(1, 'Client Secret is required'))
});

// Unified Google API config - one key for all Google services
const googleConfigSchema = v.object({
	apiKey: v.pipe(v.string(), v.minLength(1, 'API Key is required')),
	placesEnabled: v.boolean(),
	youtubeEnabled: v.boolean()
});

// Discord settings
const discordSettingsSchema = v.object({
	discordWebhookUrl: v.nullable(v.pipe(v.string(), v.url('Invalid webhook URL'))),
	discordEnabled: v.boolean(),
	discordSchedule: v.picklist(['daily', 'weekly', 'monthly']),
	discordScheduleDay: v.pipe(v.number(), v.minValue(0), v.maxValue(31)),
	discordScheduleTime: v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/, 'Invalid time format'))
});

const testWebhookSchema = v.object({
	webhookUrl: v.pipe(v.string(), v.url('Invalid webhook URL'))
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
// Commands
// ============================================================================

export const updateSpotifyConfig = command(spotifyConfigSchema, async (data) => {
	// Auto-detect artist ID from links
	const artistId = await detectSpotifyArtistFromLinks();
	if (!artistId) {
		return { success: false, message: 'No Spotify artist link found. Add a Spotify artist link first.' };
	}

	const config: SpotifyConfig = {
		artistId,
		clientId: data.clientId,
		clientSecret: data.clientSecret
	};

	// Test the config by fetching stats
	const stats = await fetchSpotifyArtistStats(config);

	if (!stats) {
		return { success: false, message: 'Failed to fetch Spotify data. Please check your credentials.' };
	}

	// Save config and cache initial stats
	await updateIntegrationConfig('spotify', config, true);
	await updateIntegrationCache('spotify', stats);

	return { success: true, message: 'Spotify connected!', stats };
});

export const saveGoogleConfig = command(googleConfigSchema, async (data) => {
	const config: GoogleConfig = {
		apiKey: data.apiKey,
		placesEnabled: data.placesEnabled,
		youtubeEnabled: data.youtubeEnabled
	};

	// If YouTube is enabled, test and fetch stats
	if (data.youtubeEnabled) {
		const channelId = await detectYouTubeChannelFromLinks(data.apiKey);

		if (channelId) {
			config.youtubeChannelId = channelId;

			// Fetch and cache YouTube stats
			const stats = await fetchYouTubeChannelStats({
				channelId,
				apiKey: data.apiKey
			});

			if (stats) {
				await updateIntegrationCache('youtube', stats);
			}
		}
	}

	// Save the unified Google config
	await updateGoogleConfig(config);

	return {
		success: true,
		message: 'Google API settings saved!',
		youtubeChannelDetected: !!config.youtubeChannelId
	};
});

export const updateDiscordSettings = command(discordSettingsSchema, async (data) => {
	const existing = await getOrCreateProfile();

	const [updated] = await db
		.update(profile)
		.set({
			discordWebhookUrl: data.discordWebhookUrl,
			discordEnabled: data.discordEnabled,
			discordSchedule: data.discordSchedule,
			discordScheduleDay: data.discordScheduleDay,
			discordScheduleTime: data.discordScheduleTime
		})
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});

export const testDiscordWebhook = command(testWebhookSchema, async (data) => {
	try {
		const [overview, pageViews, linkClicks, socialStats] = await Promise.all([
			getOverviewStats(),
			getPageViewStats(7),
			getLinkClickStats(7),
			getCachedSocialStats()
		]);

		const result = await sendDiscordReport(data.webhookUrl, {
			title: 'Test Report',
			overview,
			pageViews,
			linkClicks,
			socialStats,
			isTest: true
		});

		if (result.success) {
			return { success: true, message: 'Test message sent!' };
		} else {
			return { success: false, message: result.error || 'Failed to send message' };
		}
	} catch {
		return { success: false, message: 'Failed to send test message' };
	}
});
