import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { media, pressKit, profile } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async ({ request }) => {
	// Verify admin role - only admins can manage media
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw redirect(302, '/login');
	}

	const [currentUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
	if (currentUser?.role !== 'admin') {
		throw redirect(302, '/admin');
	}

	const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

	// Get press kit items with their media info
	const pressKitItems = await db
		.select({
			id: pressKit.id,
			mediaId: pressKit.mediaId,
			position: pressKit.position,
			media: {
				id: media.id,
				filename: media.filename,
				url: media.url,
				thumbnailUrl: media.thumbnailUrl,
				mimeType: media.mimeType,
				width: media.width,
				height: media.height,
				size: media.size
			}
		})
		.from(pressKit)
		.innerJoin(media, eq(pressKit.mediaId, media.id))
		.orderBy(asc(pressKit.position));

	// Check if press kit zip exists
	const pressKitZipPath = join(process.cwd(), 'data', 'uploads', 'press-kit.zip');
	const pressKitZipExists = existsSync(pressKitZipPath);

	// Get profile for bio
	const [profileData] = await db.select().from(profile).limit(1);

	return {
		media: allMedia,
		pressKit: pressKitItems,
		pressKitZipExists,
		bio: profileData?.bio || null,
		artistName: profileData?.name || 'Artist'
	};
};
