export interface OEmbedData {
	title: string;
	thumbnailUrl: string;
	authorName?: string;
	type?: string;
}

/**
 * Fetches oEmbed metadata from YouTube/YouTube Music URLs
 * No API key required!
 */
export async function fetchYouTubeMetadata(url: string): Promise<OEmbedData | null> {
	// Convert YouTube Music URLs to regular YouTube URLs
	const normalizedUrl = url
		.replace('music.youtube.com', 'www.youtube.com')
		.replace('youtu.be/', 'www.youtube.com/watch?v=');

	// Check if it's a YouTube URL
	if (!normalizedUrl.includes('youtube.com') && !normalizedUrl.includes('youtu.be')) {
		return null;
	}

	try {
		const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
		const response = await fetch(oembedUrl);

		if (!response.ok) {
			console.error('YouTube oEmbed failed:', response.status);
			return null;
		}

		const data = await response.json();

		return {
			title: data.title,
			thumbnailUrl: data.thumbnail_url,
			authorName: data.author_name
		};
	} catch (error) {
		console.error('Failed to fetch YouTube metadata:', error);
		return null;
	}
}

/**
 * Detects if a URL is from YouTube or YouTube Music
 */
export function isYouTubeUrl(url: string): boolean {
	return (
		url.includes('youtube.com') ||
		url.includes('youtu.be') ||
		url.includes('music.youtube.com')
	);
}

/**
 * Extracts video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
		/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}

	return null;
}

/**
 * Fetches oEmbed metadata from Spotify URLs
 * No API key required!
 */
export async function fetchSpotifyMetadata(url: string): Promise<OEmbedData | null> {
	if (!isSpotifyUrl(url)) {
		return null;
	}

	try {
		const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
		const response = await fetch(oembedUrl);

		if (!response.ok) {
			console.error('Spotify oEmbed failed:', response.status);
			return null;
		}

		const data = await response.json();

		// Extract type from URL
		let type = 'track';
		if (url.includes('/album/')) type = 'album';
		else if (url.includes('/playlist/')) type = 'playlist';
		else if (url.includes('/artist/')) type = 'artist';

		return {
			title: data.title,
			thumbnailUrl: data.thumbnail_url,
			type
		};
	} catch (error) {
		console.error('Failed to fetch Spotify metadata:', error);
		return null;
	}
}

/**
 * Detects if a URL is from Spotify
 */
export function isSpotifyUrl(url: string): boolean {
	return url.includes('open.spotify.com/');
}

/**
 * Extracts embed info from Spotify URLs
 * Returns the ID and type (track, album, playlist, artist)
 */
export function extractSpotifyEmbedInfo(url: string): { id: string; type: 'track' | 'album' | 'playlist' | 'artist' } | null {
	// Patterns for different Spotify URL formats:
	// https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
	// https://open.spotify.com/album/4iV5W9uYEdYUVa79Axb7Rh
	// https://open.spotify.com/playlist/4iV5W9uYEdYUVa79Axb7Rh
	// https://open.spotify.com/artist/4iV5W9uYEdYUVa79Axb7Rh
	// May include query params like ?si=xxxx
	const pattern = /open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/;
	const match = url.match(pattern);

	if (match) {
		return {
			type: match[1] as 'track' | 'album' | 'playlist' | 'artist',
			id: match[2]
		};
	}

	return null;
}

/**
 * Fetches metadata from Bandcamp URLs by scraping the page
 * The oEmbed API is unreliable, so we extract from meta tags
 */
export async function fetchBandcampMetadata(url: string): Promise<(OEmbedData & { embedId?: string; embedType?: 'album' | 'track' }) | null> {
	if (!isBandcampUrl(url)) {
		return null;
	}

	try {
		// Fetch the page HTML directly
		const response = await fetch(url);

		if (!response.ok) {
			console.error('Bandcamp page fetch failed:', response.status);
			return null;
		}

		const html = await response.text();

		// Extract embed info from bc-page-properties meta tag
		// Format: {"item_type":"a","item_id":1285143494,...}
		const bcPropsMatch = html.match(/<meta\s+name="bc-page-properties"\s+content="([^"]+)"/);
		let embedId: string | undefined;
		let embedType: 'album' | 'track' | undefined;

		if (bcPropsMatch) {
			try {
				const props = JSON.parse(bcPropsMatch[1].replace(/&quot;/g, '"'));
				embedId = String(props.item_id);
				embedType = props.item_type === 'a' ? 'album' : 'track';
			} catch {
				// Try extracting from og:video URL as fallback
				const ogVideoMatch = html.match(/og:video[^>]+content="[^"]*(?:album|track)=(\d+)/);
				if (ogVideoMatch) {
					embedId = ogVideoMatch[1];
					embedType = html.includes('album=' + ogVideoMatch[1]) ? 'album' : 'track';
				}
			}
		}

		// Extract title from og:title
		const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
		const title = titleMatch ? titleMatch[1] : undefined;

		// Extract thumbnail from og:image
		const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
		const thumbnailUrl = imageMatch ? imageMatch[1] : undefined;

		// Extract artist from og:site_name or page content
		const artistMatch = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/);
		const authorName = artistMatch ? artistMatch[1] : undefined;

		if (!title && !thumbnailUrl && !embedId) {
			return null;
		}

		return {
			title: title || 'Bandcamp',
			thumbnailUrl: thumbnailUrl || '',
			authorName,
			embedId,
			embedType
		};
	} catch (error) {
		console.error('Failed to fetch Bandcamp metadata:', error);
		return null;
	}
}

/**
 * Detects if a URL is from Bandcamp
 */
export function isBandcampUrl(url: string): boolean {
	return url.includes('bandcamp.com/');
}

/**
 * Detects platform and category from a URL
 */
export function detectPlatformFromUrl(url: string): { platform: string; category: 'streaming' | 'social' } | null {
	const lowerUrl = url.toLowerCase();

	// Streaming platforms
	if (lowerUrl.includes('open.spotify.com')) return { platform: 'spotify', category: 'streaming' };
	if (lowerUrl.includes('music.apple.com')) return { platform: 'apple_music', category: 'streaming' };
	if (lowerUrl.includes('music.youtube.com')) return { platform: 'youtube_music', category: 'streaming' };
	if (lowerUrl.includes('soundcloud.com')) return { platform: 'soundcloud', category: 'streaming' };
	if (lowerUrl.includes('bandcamp.com')) return { platform: 'bandcamp', category: 'streaming' };
	if (lowerUrl.includes('deezer.com')) return { platform: 'deezer', category: 'streaming' };
	if (lowerUrl.includes('tidal.com')) return { platform: 'tidal', category: 'streaming' };

	// Social platforms
	if (lowerUrl.includes('instagram.com')) return { platform: 'instagram', category: 'social' };
	if (lowerUrl.includes('tiktok.com')) return { platform: 'tiktok', category: 'social' };
	if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return { platform: 'twitter', category: 'social' };
	if (lowerUrl.includes('facebook.com')) return { platform: 'facebook', category: 'social' };
	if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return { platform: 'youtube', category: 'social' };

	return null;
}
