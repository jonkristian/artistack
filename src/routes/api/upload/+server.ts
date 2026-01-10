import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/api';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = 'static/uploads';
const THUMBNAIL_SIZE = 400; // Thumbnail max dimension
const MAX_DIMENSION = 2048; // Max dimension for full-size images
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 85;

// Magic bytes for allowed image types
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
	'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
	'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
	'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }],
	'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }]
};

// Allowed type parameter values (sanitized)
const ALLOWED_TYPES = ['logo', 'photo', 'background', 'image', 'media'];

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

	// Validate file size first (max 10MB for raw uploads, will be compressed)
	const maxSize = 10 * 1024 * 1024;
	if (file.size > maxSize) {
		throw error(400, 'File too large. Maximum size is 10MB');
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
		console.warn(`MIME type mismatch: claimed ${file.type}, detected ${detectedMimeType}`);
	}

	// Sanitize the type parameter
	const sanitizedType = type && ALLOWED_TYPES.includes(type) ? type : 'image';

	// Ensure upload directory exists
	if (!existsSync(UPLOAD_DIR)) {
		await mkdir(UPLOAD_DIR, { recursive: true });
	}

	const timestamp = Date.now();
	const baseFilename = `${sanitizedType}-${timestamp}`;

	// Process image with sharp
	let sharpInstance = sharp(buffer)
		.rotate() // Auto-rotate based on EXIF orientation
		.withMetadata({ orientation: undefined }); // Strip EXIF but keep color profile

	// Get original dimensions
	const metadata = await sharp(buffer).metadata();
	const originalWidth = metadata.width || 0;
	const originalHeight = metadata.height || 0;

	// Resize if too large (maintain aspect ratio)
	if (originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION) {
		sharpInstance = sharpInstance.resize(MAX_DIMENSION, MAX_DIMENSION, {
			fit: 'inside',
			withoutEnlargement: true
		});
	}

	// Determine output format - convert PNG to WebP for better compression, keep JPEG as JPEG
	let outputBuffer: Buffer;
	let outputExt: string;
	let outputMimeType: string;

	if (detectedMimeType === 'image/gif') {
		// Keep GIFs as-is (for animations)
		outputBuffer = buffer;
		outputExt = 'gif';
		outputMimeType = 'image/gif';
	} else if (detectedMimeType === 'image/png' || detectedMimeType === 'image/webp') {
		// Convert to WebP for better compression
		outputBuffer = await sharpInstance.webp({ quality: WEBP_QUALITY }).toBuffer();
		outputExt = 'webp';
		outputMimeType = 'image/webp';
	} else {
		// JPEG stays as JPEG
		outputBuffer = await sharpInstance.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
		outputExt = 'jpg';
		outputMimeType = 'image/jpeg';
	}

	// Generate thumbnail
	let thumbnailBuffer: Buffer;
	if (detectedMimeType === 'image/gif') {
		// For GIFs, just resize (loses animation but that's OK for thumbnails)
		thumbnailBuffer = await sharp(buffer, { animated: false })
			.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	} else {
		thumbnailBuffer = await sharp(buffer)
			.rotate()
			.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	}

	// Get final dimensions
	const finalMetadata = await sharp(outputBuffer).metadata();
	const width = finalMetadata.width || originalWidth;
	const height = finalMetadata.height || originalHeight;

	// Write files
	const filename = `${baseFilename}.${outputExt}`;
	const thumbnailFilename = `${baseFilename}-thumb.webp`;

	await Promise.all([
		sharp(outputBuffer).toFile(join(UPLOAD_DIR, filename)),
		sharp(thumbnailBuffer).toFile(join(UPLOAD_DIR, thumbnailFilename))
	]);

	// Return URLs and metadata
	const url = `/uploads/${filename}`;
	const thumbnailUrl = `/uploads/${thumbnailFilename}`;

	return json({
		url,
		thumbnailUrl,
		width,
		height,
		size: outputBuffer.length,
		mimeType: outputMimeType
	});
};
