import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/api';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = 'static/uploads';

// Magic bytes for allowed image types
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
	'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
	'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
	'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }],
	'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }]
};

// Map magic bytes to file extensions
const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp'
};

// Allowed type parameter values (sanitized)
const ALLOWED_TYPES = ['logo', 'photo', 'background', 'image'];

/**
 * Validates file content by checking magic bytes
 */
function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
	const signatures = MAGIC_BYTES[mimeType];
	if (!signatures) return false;

	// For WebP, we need to check two separate signatures
	if (mimeType === 'image/webp') {
		const riffMatch = buffer.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46]));
		const webpMatch = buffer.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));
		return riffMatch && webpMatch;
	}

	// For other types, check if any signature matches
	return signatures.some((sig) => {
		const offset = sig.offset || 0;
		const expected = Buffer.from(sig.bytes);
		const actual = buffer.subarray(offset, offset + sig.bytes.length);
		return actual.equals(expected);
	});
}

/**
 * Detects the actual MIME type from file content
 */
function detectMimeType(buffer: Buffer): string | null {
	for (const [mimeType] of Object.entries(MAGIC_BYTES)) {
		if (validateMagicBytes(buffer, mimeType)) {
			return mimeType;
		}
	}
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	await requireAuth(request);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const type = formData.get('type') as string | null;

	if (!file) {
		throw error(400, 'No file provided');
	}

	// Validate file size first (max 5MB)
	const maxSize = 5 * 1024 * 1024;
	if (file.size > maxSize) {
		throw error(400, 'File too large. Maximum size is 5MB');
	}

	// Read file buffer for content validation
	const buffer = Buffer.from(await file.arrayBuffer());

	// Detect actual MIME type from file content (not trusting the reported type)
	const detectedMimeType = detectMimeType(buffer);
	if (!detectedMimeType) {
		throw error(400, 'Invalid file content. Allowed: JPEG, PNG, WebP, GIF');
	}

	// Verify the claimed MIME type matches the detected type (optional strictness)
	const allowedTypes = Object.keys(MAGIC_BYTES);
	if (!allowedTypes.includes(file.type) || file.type !== detectedMimeType) {
		// Log potential spoofing attempt but allow if content is valid
		console.warn(`MIME type mismatch: claimed ${file.type}, detected ${detectedMimeType}`);
	}

	// Sanitize the type parameter
	const sanitizedType = type && ALLOWED_TYPES.includes(type) ? type : 'image';

	// Ensure upload directory exists
	if (!existsSync(UPLOAD_DIR)) {
		await mkdir(UPLOAD_DIR, { recursive: true });
	}

	// Use detected MIME type for extension (don't trust user-provided extension)
	const ext = MIME_TO_EXT[detectedMimeType];
	const filename = `${sanitizedType}-${Date.now()}.${ext}`;
	const filepath = join(UPLOAD_DIR, filename);

	// Write file
	await writeFile(filepath, buffer);

	// Return the URL path
	const url = `/uploads/${filename}`;

	return json({ url });
};
