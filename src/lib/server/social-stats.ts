import { db } from './db';
import { integrations, links } from './schema';
import { eq } from 'drizzle-orm';
import { extractSpotifyArtistId, extractYouTubeChannelId } from '$lib/utils/platforms';

// ============================================================================
// Types
// ============================================================================

export interface SpotifyArtistStats {
	followers: number;
	monthlyListeners?: number;
	popularity: number;
	topTracks?: Array<{
		name: string;
		playCount?: number;
	}>;
	lastUpdated: Date;
}

export interface SpotifyConfig {
	artistId?: string; // Optional - can be auto-detected from links
	accessToken?: string;
	refreshToken?: string;
	tokenExpiry?: number;
	clientId?: string;
	clientSecret?: string;
}

export interface YouTubeChannelStats {
	subscriberCount: number;
	viewCount: number;
	videoCount: number;
	recentVideos?: Array<{
		title: string;
		viewCount: number;
		publishedAt: string;
	}>;
	lastUpdated: Date;
}

export interface YouTubeConfig {
	channelId?: string; // Optional - can be auto-detected from links
	apiKey: string;
}

export interface GoogleConfig {
	apiKey: string;
	// Enabled services
	placesEnabled?: boolean;
	youtubeEnabled?: boolean;
	// YouTube-specific (auto-detected)
	youtubeChannelId?: string;
}

export interface SocialStats {
	spotify?: SpotifyArtistStats;
	youtube?: YouTubeChannelStats;
}

// ============================================================================
// Spotify Stats Fetcher
// ============================================================================

/**
 * Get Spotify artist stats using Client Credentials flow (public data only)
 * This doesn't require user OAuth, just client credentials
 */
export async function fetchSpotifyArtistStats(config: SpotifyConfig): Promise<SpotifyArtistStats | null> {
	if (!config.artistId || !config.clientId || !config.clientSecret) {
		return null;
	}

	try {
		// Get access token using Client Credentials flow
		const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
			},
			body: 'grant_type=client_credentials'
		});

		if (!tokenResponse.ok) {
			console.error('Spotify token error:', await tokenResponse.text());
			return null;
		}

		const { access_token } = await tokenResponse.json();

		// Fetch artist data
		const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${config.artistId}`, {
			headers: {
				Authorization: `Bearer ${access_token}`
			}
		});

		if (!artistResponse.ok) {
			console.error('Spotify artist error:', await artistResponse.text());
			return null;
		}

		const artist = await artistResponse.json();

		// Fetch top tracks
		const topTracksResponse = await fetch(
			`https://api.spotify.com/v1/artists/${config.artistId}/top-tracks?market=US`,
			{
				headers: {
					Authorization: `Bearer ${access_token}`
				}
			}
		);

		let topTracks: SpotifyArtistStats['topTracks'] = undefined;
		if (topTracksResponse.ok) {
			const { tracks } = await topTracksResponse.json();
			topTracks = tracks.slice(0, 5).map((track: { name: string }) => ({
				name: track.name
			}));
		}

		return {
			followers: artist.followers?.total ?? 0,
			popularity: artist.popularity ?? 0,
			topTracks,
			lastUpdated: new Date()
		};
	} catch (error) {
		console.error('Spotify fetch error:', error);
		return null;
	}
}

// ============================================================================
// YouTube Stats Fetcher
// ============================================================================

/**
 * Get YouTube channel stats using the YouTube Data API v3
 */
export async function fetchYouTubeChannelStats(config: YouTubeConfig): Promise<YouTubeChannelStats | null> {
	if (!config.channelId || !config.apiKey) {
		return null;
	}

	try {
		// Fetch channel stats
		const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
		channelUrl.searchParams.set('part', 'statistics');
		channelUrl.searchParams.set('id', config.channelId);
		channelUrl.searchParams.set('key', config.apiKey);

		const channelResponse = await fetch(channelUrl.toString());

		if (!channelResponse.ok) {
			console.error('YouTube channel error:', await channelResponse.text());
			return null;
		}

		const channelData = await channelResponse.json();
		const channel = channelData.items?.[0];

		if (!channel) {
			return null;
		}

		const stats = channel.statistics;

		// Fetch recent videos
		const videosUrl = new URL('https://www.googleapis.com/youtube/v3/search');
		videosUrl.searchParams.set('part', 'snippet');
		videosUrl.searchParams.set('channelId', config.channelId);
		videosUrl.searchParams.set('order', 'date');
		videosUrl.searchParams.set('type', 'video');
		videosUrl.searchParams.set('maxResults', '5');
		videosUrl.searchParams.set('key', config.apiKey);

		let recentVideos: YouTubeChannelStats['recentVideos'] = undefined;

		const videosResponse = await fetch(videosUrl.toString());
		if (videosResponse.ok) {
			const videosData = await videosResponse.json();
			const videoIds = videosData.items?.map((v: { id: { videoId: string } }) => v.id.videoId).join(',');

			if (videoIds) {
				// Get video statistics
				const videoStatsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
				videoStatsUrl.searchParams.set('part', 'statistics,snippet');
				videoStatsUrl.searchParams.set('id', videoIds);
				videoStatsUrl.searchParams.set('key', config.apiKey);

				const videoStatsResponse = await fetch(videoStatsUrl.toString());
				if (videoStatsResponse.ok) {
					const videoStatsData = await videoStatsResponse.json();
					recentVideos = videoStatsData.items?.slice(0, 5).map(
						(v: {
							snippet: { title: string; publishedAt: string };
							statistics: { viewCount: string };
						}) => ({
							title: v.snippet.title,
							viewCount: parseInt(v.statistics.viewCount || '0', 10),
							publishedAt: v.snippet.publishedAt
						})
					);
				}
			}
		}

		return {
			subscriberCount: parseInt(stats.subscriberCount || '0', 10),
			viewCount: parseInt(stats.viewCount || '0', 10),
			videoCount: parseInt(stats.videoCount || '0', 10),
			recentVideos,
			lastUpdated: new Date()
		};
	} catch (error) {
		console.error('YouTube fetch error:', error);
		return null;
	}
}

// ============================================================================
// Auto-Detection from Links
// ============================================================================

/**
 * Auto-detect Spotify artist ID from user's existing links
 */
export async function detectSpotifyArtistFromLinks(): Promise<string | null> {
	const spotifyLinks = await db
		.select()
		.from(links)
		.where(eq(links.platform, 'spotify'));

	for (const link of spotifyLinks) {
		const artistId = extractSpotifyArtistId(link.url);
		if (artistId) {
			return artistId;
		}
	}
	return null;
}

/**
 * Auto-detect YouTube channel ID from user's existing links
 * Returns a channel ID ready for API use (resolves handles if needed)
 */
export async function detectYouTubeChannelFromLinks(apiKey?: string): Promise<string | null> {
	const youtubeLinks = await db
		.select()
		.from(links)
		.where(eq(links.platform, 'youtube'));

	for (const link of youtubeLinks) {
		const result = extractYouTubeChannelId(link.url);
		if (result) {
			if (result.type === 'channel') {
				// Direct channel ID - ready to use
				return result.id;
			} else if (apiKey) {
				// Handle or custom name - need to resolve via API
				const channelId = await resolveYouTubeChannel(result.id, result.type, apiKey);
				if (channelId) return channelId;
			}
		}
	}
	return null;
}

/**
 * Resolve a YouTube handle or custom name to a channel ID
 */
async function resolveYouTubeChannel(
	identifier: string,
	type: 'handle' | 'custom',
	apiKey: string
): Promise<string | null> {
	try {
		const url = new URL('https://www.googleapis.com/youtube/v3/channels');

		if (type === 'handle') {
			url.searchParams.set('forHandle', identifier);
		} else {
			// For custom URLs, try forUsername first
			url.searchParams.set('forUsername', identifier);
		}

		url.searchParams.set('part', 'id');
		url.searchParams.set('key', apiKey);

		const response = await fetch(url.toString());
		if (response.ok) {
			const data = await response.json();
			return data.items?.[0]?.id || null;
		}
	} catch {
		// Silently fail
	}
	return null;
}

// ============================================================================
// Database Integration
// ============================================================================

/**
 * Get or create an integration record for a provider
 */
async function getOrCreateIntegration(provider: string) {
	const [existing] = await db
		.select()
		.from(integrations)
		.where(eq(integrations.provider, provider))
		.limit(1);

	if (existing) return existing;

	const [created] = await db
		.insert(integrations)
		.values({ provider, enabled: false })
		.returning();

	return created;
}

/**
 * Update cached stats for a provider
 */
export async function updateIntegrationCache(
	provider: string,
	cachedData: unknown
): Promise<void> {
	const integration = await getOrCreateIntegration(provider);

	await db
		.update(integrations)
		.set({
			cachedData: cachedData as Record<string, unknown>,
			lastSync: new Date()
		})
		.where(eq(integrations.id, integration.id));
}

/**
 * Get cached stats for a provider
 */
export async function getIntegrationCache(provider: string): Promise<unknown | null> {
	const [integration] = await db
		.select()
		.from(integrations)
		.where(eq(integrations.provider, provider))
		.limit(1);

	return integration?.cachedData ?? null;
}

/**
 * Get integration config for a provider
 */
export async function getIntegrationConfig(provider: string): Promise<unknown | null> {
	const [integration] = await db
		.select()
		.from(integrations)
		.where(eq(integrations.provider, provider))
		.limit(1);

	return integration?.config ?? null;
}

/**
 * Update integration config for a provider
 */
export async function updateIntegrationConfig(
	provider: string,
	config: unknown,
	enabled: boolean = true
): Promise<void> {
	const integration = await getOrCreateIntegration(provider);

	await db
		.update(integrations)
		.set({
			config: config as Record<string, unknown>,
			enabled
		})
		.where(eq(integrations.id, integration.id));
}

/**
 * Fetch and cache all enabled social stats
 * Uses auto-detection from links when IDs aren't manually configured
 */
export async function refreshAllSocialStats(): Promise<SocialStats> {
	const stats: SocialStats = {};

	// Fetch Spotify stats if configured
	const spotifyConfig = (await getIntegrationConfig('spotify')) as SpotifyConfig | null;
	if (spotifyConfig?.clientId && spotifyConfig?.clientSecret) {
		// Auto-detect artist ID from links if not configured
		let artistId = spotifyConfig.artistId;
		if (!artistId) {
			artistId = await detectSpotifyArtistFromLinks() ?? undefined;
		}

		if (artistId) {
			const spotifyStats = await fetchSpotifyArtistStats({
				...spotifyConfig,
				artistId
			});
			if (spotifyStats) {
				stats.spotify = spotifyStats;
				await updateIntegrationCache('spotify', spotifyStats);
			}
		}
	}

	// Fetch YouTube stats if configured
	const youtubeConfig = (await getIntegrationConfig('youtube')) as YouTubeConfig | null;
	if (youtubeConfig?.apiKey) {
		// Auto-detect channel ID from links if not configured
		let channelId = youtubeConfig.channelId;
		if (!channelId) {
			channelId = await detectYouTubeChannelFromLinks(youtubeConfig.apiKey) ?? undefined;
		}

		if (channelId) {
			const youtubeStats = await fetchYouTubeChannelStats({
				...youtubeConfig,
				channelId
			});
			if (youtubeStats) {
				stats.youtube = youtubeStats;
				await updateIntegrationCache('youtube', youtubeStats);
			}
		}
	}

	return stats;
}

/**
 * Get all cached social stats
 */
export async function getCachedSocialStats(): Promise<SocialStats> {
	const [spotifyData, youtubeData] = await Promise.all([
		getIntegrationCache('spotify'),
		getIntegrationCache('youtube')
	]);

	return {
		spotify: spotifyData as SpotifyArtistStats | undefined,
		youtube: youtubeData as YouTubeChannelStats | undefined
	};
}

/**
 * Get detected platform IDs from existing links
 * Useful for showing auto-detected values in the UI
 */
export async function getDetectedPlatformIds(): Promise<{
	spotify: { artistId: string | null };
	youtube: { channelId: string | null; rawId: string | null; type: 'channel' | 'handle' | 'custom' | null };
}> {
	const [spotifyArtistId, youtubeLinks] = await Promise.all([
		detectSpotifyArtistFromLinks(),
		db.select().from(links).where(eq(links.platform, 'youtube'))
	]);

	let youtubeInfo: { channelId: string | null; rawId: string | null; type: 'channel' | 'handle' | 'custom' | null } = {
		channelId: null,
		rawId: null,
		type: null
	};

	// Get raw YouTube ID info (without API resolution)
	for (const link of youtubeLinks) {
		const result = extractYouTubeChannelId(link.url);
		if (result) {
			youtubeInfo = {
				channelId: result.type === 'channel' ? result.id : null,
				rawId: result.id,
				type: result.type
			};
			break;
		}
	}

	return {
		spotify: { artistId: spotifyArtistId },
		youtube: youtubeInfo
	};
}

/**
 * Get the Google integration config
 */
export async function getGoogleConfig(): Promise<GoogleConfig | null> {
	return (await getIntegrationConfig('google')) as GoogleConfig | null;
}

/**
 * Update Google integration config
 */
export async function updateGoogleConfig(config: GoogleConfig): Promise<void> {
	await updateIntegrationConfig('google', config, true);
}

/**
 * Fetch YouTube stats using Google config
 */
export async function fetchYouTubeStatsFromGoogleConfig(): Promise<YouTubeChannelStats | null> {
	const googleConfig = await getGoogleConfig();
	if (!googleConfig?.apiKey || !googleConfig.youtubeEnabled) {
		return null;
	}

	// Auto-detect channel ID from links if not configured
	let channelId = googleConfig.youtubeChannelId;
	if (!channelId) {
		channelId = await detectYouTubeChannelFromLinks(googleConfig.apiKey) ?? undefined;
	}

	if (!channelId) {
		return null;
	}

	return fetchYouTubeChannelStats({
		channelId,
		apiKey: googleConfig.apiKey
	});
}
