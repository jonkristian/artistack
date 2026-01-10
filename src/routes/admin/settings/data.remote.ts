import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Validation Schemas
// ============================================================================

const settingsSchema = v.object({
	siteTitle: v.optional(v.nullable(v.string())),
	locale: v.optional(v.string()),
	googlePlacesApiKey: v.optional(v.nullable(v.string()))
});

const generateFaviconSchema = v.object({
	sourceUrl: v.pipe(v.string(), v.nonEmpty('Source image is required'))
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getOrCreateProfile() {
	const [existing] = await db.select().from(profile).limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(profile)
		.values({ name: 'Artist Name' })
		.returning();
	return created;
}

/**
 * Creates an ICO file from multiple PNG buffers
 * ICO format: header + directory entries + image data
 */
function createIco(images: { size: number; buffer: Buffer }[]): Buffer {
	const headerSize = 6;
	const dirEntrySize = 16;
	const headerAndDir = headerSize + dirEntrySize * images.length;

	// Calculate total size
	let totalSize = headerAndDir;
	for (const img of images) {
		totalSize += img.buffer.length;
	}

	const ico = Buffer.alloc(totalSize);
	let offset = 0;

	// ICO header
	ico.writeUInt16LE(0, offset); // Reserved
	offset += 2;
	ico.writeUInt16LE(1, offset); // Type: 1 = ICO
	offset += 2;
	ico.writeUInt16LE(images.length, offset); // Number of images
	offset += 2;

	// Directory entries
	let dataOffset = headerAndDir;
	for (const img of images) {
		ico.writeUInt8(img.size === 256 ? 0 : img.size, offset); // Width (0 = 256)
		offset += 1;
		ico.writeUInt8(img.size === 256 ? 0 : img.size, offset); // Height (0 = 256)
		offset += 1;
		ico.writeUInt8(0, offset); // Color palette
		offset += 1;
		ico.writeUInt8(0, offset); // Reserved
		offset += 1;
		ico.writeUInt16LE(1, offset); // Color planes
		offset += 2;
		ico.writeUInt16LE(32, offset); // Bits per pixel
		offset += 2;
		ico.writeUInt32LE(img.buffer.length, offset); // Image size
		offset += 4;
		ico.writeUInt32LE(dataOffset, offset); // Image offset
		offset += 4;
		dataOffset += img.buffer.length;
	}

	// Image data
	for (const img of images) {
		img.buffer.copy(ico, offset);
		offset += img.buffer.length;
	}

	return ico;
}

// ============================================================================
// Settings Command (for auto-save)
// ============================================================================

export const updateSettings = command(settingsSchema, async (data) => {
	const existing = await getOrCreateProfile();

	// Filter out undefined values
	const updates: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (value !== undefined) {
			updates[key] = value;
		}
	}

	const [updated] = await db
		.update(profile)
		.set(updates)
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});

// ============================================================================
// Favicon Generation Command
// ============================================================================

export const generateFavicon = command(generateFaviconSchema, async ({ sourceUrl }) => {
	const existing = await getOrCreateProfile();

	// Convert URL path to file path (e.g., /uploads/image.jpg -> data/uploads/image.jpg)
	const sourcePath = join('data', sourceUrl.replace(/^\//, ''));

	// Read source image
	const sourceBuffer = await readFile(sourcePath);

	// Generate favicon sizes
	const sizes = [
		{ name: 'favicon-16.png', size: 16 },
		{ name: 'favicon-32.png', size: 32 },
		{ name: 'favicon-48.png', size: 48 },
		{ name: 'apple-touch-icon.png', size: 180 },
		{ name: 'icon-192.png', size: 192 },
		{ name: 'icon-512.png', size: 512 }
	];

	// Generate all PNG sizes
	const generatedImages: { name: string; size: number; buffer: Buffer }[] = [];

	for (const { name, size } of sizes) {
		const buffer = await sharp(sourceBuffer)
			.resize(size, size, { fit: 'cover', position: 'center' })
			.png()
			.toBuffer();

		generatedImages.push({ name, size, buffer });

		// Write to data folder
		await writeFile(join('data', name), buffer);
	}

	// Create ICO file from 16, 32, 48 sizes
	const icoImages = generatedImages
		.filter((img) => [16, 32, 48].includes(img.size))
		.map((img) => ({ size: img.size, buffer: img.buffer }));

	const icoBuffer = createIco(icoImages);
	await writeFile(join('data', 'favicon.ico'), icoBuffer);

	// Update profile
	const [updated] = await db
		.update(profile)
		.set({
			faviconUrl: sourceUrl,
			faviconGenerated: true
		})
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});
