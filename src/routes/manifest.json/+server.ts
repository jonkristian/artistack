import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { profile, settings } from '$lib/server/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Get profile and settings data for dynamic manifest
	const [profileData] = await db.select().from(profile).limit(1);
	const [settingsData] = await db.select().from(settings).limit(1);

	const name = settingsData?.siteTitle || profileData?.name || 'Artistack';
	const shortName = name.length > 12 ? name.substring(0, 12) : name;
	const bgColor = settingsData?.colorBg || '#0f0f0f';
	const themeColor = settingsData?.colorAccent || '#8b5cf6';

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
