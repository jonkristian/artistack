import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/api';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = 'static/uploads';

export const POST: RequestHandler = async ({ request }) => {
	await requireAuth(request);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const type = formData.get('type') as string | null; // 'logo', 'photo', 'background'

	if (!file) {
		throw error(400, 'No file provided');
	}

	// Validate file type
	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	if (!allowedTypes.includes(file.type)) {
		throw error(400, 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
	}

	// Validate file size (max 5MB)
	const maxSize = 5 * 1024 * 1024;
	if (file.size > maxSize) {
		throw error(400, 'File too large. Maximum size is 5MB');
	}

	// Ensure upload directory exists
	if (!existsSync(UPLOAD_DIR)) {
		await mkdir(UPLOAD_DIR, { recursive: true });
	}

	// Generate unique filename
	const ext = file.name.split('.').pop() || 'jpg';
	const filename = `${type || 'image'}-${Date.now()}.${ext}`;
	const filepath = join(UPLOAD_DIR, filename);

	// Write file
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(filepath, buffer);

	// Return the URL path
	const url = `/uploads/${filename}`;

	return json({ url });
};
