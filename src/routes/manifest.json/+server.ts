import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Get profile data for dynamic manifest
	const [profileData] = await db.select().from(profile).limit(1);

	const name = profileData?.name || 'Artistack';
	const shortName = name.length > 12 ? name.substring(0, 12) : name;
	const bgColor = profileData?.colorBg || '#0f0f0f';
	const themeColor = profileData?.colorAccent || '#8b5cf6';

	const manifest = {
		name,
		short_name: shortName,
		description: profileData?.bio?.substring(0, 160) || `${name}'s official page`,
		start_url: '/',
		display: 'standalone',
		background_color: bgColor,
		theme_color: themeColor,
		icons: [
			{
				src: '/icon-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'any maskable'
			},
			{
				src: '/icon-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any maskable'
			}
		]
	};

	return json(manifest, {
		headers: {
			'Content-Type': 'application/manifest+json',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
