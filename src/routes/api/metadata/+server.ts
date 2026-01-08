import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import {
	fetchYouTubeMetadata,
	isYouTubeUrl,
	fetchSpotifyMetadata,
	isSpotifyUrl,
	fetchBandcampMetadata,
	isBandcampUrl
} from '$lib/server/oembed';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}

	const { url } = await request.json();

	if (!url) {
		throw error(400, 'URL required');
	}

	// Try YouTube/YouTube Music
	if (isYouTubeUrl(url)) {
		const metadata = await fetchYouTubeMetadata(url);
		if (metadata) {
			return json({
				title: metadata.title,
				thumbnailUrl: metadata.thumbnailUrl,
				authorName: metadata.authorName,
				source: 'youtube'
			});
		}
	}

	// Try Spotify
	if (isSpotifyUrl(url)) {
		const metadata = await fetchSpotifyMetadata(url);
		if (metadata) {
			return json({
				title: metadata.title,
				thumbnailUrl: metadata.thumbnailUrl,
				type: metadata.type,
				source: 'spotify'
			});
		}
	}

	// Try Bandcamp
	if (isBandcampUrl(url)) {
		const metadata = await fetchBandcampMetadata(url);
		if (metadata) {
			return json({
				title: metadata.title,
				thumbnailUrl: metadata.thumbnailUrl,
				authorName: metadata.authorName,
				embedData: metadata.embedId ? { id: metadata.embedId, type: metadata.embedType } : null,
				source: 'bandcamp'
			});
		}
	}

	// No metadata found
	return json({ title: null, thumbnailUrl: null, source: null });
};
