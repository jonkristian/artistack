import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { media, blocks, profile } from '$lib/server/schema';
import type { ImagesBlockConfig } from '$lib/server/schema';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq } from 'drizzle-orm';
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

	// Find the download-type images block (press kit)
	const imageBlocks = await db
		.select()
		.from(blocks)
		.where(eq(blocks.type, 'images'));

	// Find the press kit block (displayAs: 'download')
	const pressKitBlock = imageBlocks.find((b) => {
		const config = b.config as ImagesBlockConfig | null;
		return config?.displayAs === 'download';
	});

	const pressKitMediaIds: number[] = pressKitBlock
		? ((pressKitBlock.config as ImagesBlockConfig)?.mediaIds ?? [])
		: [];

	// Check if press kit zip exists
	const pressKitZipPath = join(process.cwd(), 'data', 'uploads', 'press-kit.zip');
	const pressKitZipExists = existsSync(pressKitZipPath);

	// Get profile for bio
	const [profileData] = await db.select().from(profile).limit(1);

	return {
		media: allMedia,
		pressKitBlockId: pressKitBlock?.id ?? null,
		pressKitMediaIds,
		pressKitZipExists,
		bio: profileData?.bio || null,
		artistName: profileData?.name || 'Artist'
	};
};
