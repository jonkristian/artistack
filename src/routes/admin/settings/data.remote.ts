import { requireAdmin } from '$lib/server/guards';
import { getSettings, updateSiteSettings } from '$lib/server/settings';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile, settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { DATA_DIR, mediaPath } from '$lib/server/paths';
import { testSmtpConnection } from '$lib/server/email';

// ============================================================================
// Validation Schemas
// ============================================================================

const settingsSchema = v.object({
  siteTitle: v.optional(v.nullable(v.string())),
  locale: v.optional(v.string()),
  pressKitEnabled: v.optional(v.boolean()),
  clipsEnabled: v.optional(v.boolean()),
  releasesEnabled: v.optional(v.boolean()),
  subscribersEnabled: v.optional(v.boolean()),
  pixelsEnabled: v.optional(v.boolean()),
  metaPixelId: v.optional(v.nullable(v.string())),
  metaCapiToken: v.optional(v.nullable(v.string())),
  tiktokPixelId: v.optional(v.nullable(v.string()))
});

const generateFaviconSchema = v.object({
  sourceUrl: v.pipe(v.string(), v.nonEmpty('Source image is required'))
});

const smtpSettingsSchema = v.object({
  smtpHost: v.optional(v.nullable(v.string())),
  smtpPort: v.optional(v.nullable(v.number())),
  smtpUser: v.optional(v.nullable(v.string())),
  smtpPassword: v.optional(v.nullable(v.string())),
  smtpFromAddress: v.optional(v.nullable(v.string())),
  smtpFromName: v.optional(v.nullable(v.string())),
  smtpTls: v.optional(v.boolean())
});

// ============================================================================
// Helper Functions
// ============================================================================

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
  await requireAdmin();

  // Filter out undefined values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  await updateSiteSettings(updates);

  return { success: true };
});

// ============================================================================
// Favicon Generation Command
// ============================================================================

export const generateFavicon = command(generateFaviconSchema, async ({ sourceUrl }) => {
  await requireAdmin();

  const sourcePath = mediaPath(sourceUrl);

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
    await writeFile(join(DATA_DIR, name), buffer);
  }

  // Create ICO file from 16, 32, 48 sizes
  const icoImages = generatedImages
    .filter((img) => [16, 32, 48].includes(img.size))
    .map((img) => ({ size: img.size, buffer: img.buffer }));

  const icoBuffer = createIco(icoImages);
  await writeFile(join(DATA_DIR, 'favicon.ico'), icoBuffer);

  // Update settings
  await updateSiteSettings({
    faviconUrl: sourceUrl,
    faviconGenerated: true
  });

  return { success: true };
});

// ============================================================================
// Favicon from Initials Command
// ============================================================================

export const generateFaviconFromInitials = command(
  v.object({
    name: v.optional(v.string()),
    rounded: v.optional(v.boolean()),
    length: v.optional(v.number())
  }),
  async ({ name, rounded = false, length = 2 }) => {
    await requireAdmin();
    const [artistProfile] = await db.select().from(profile).limit(1);

    const current = await getSettings();

    const displayName = name || current.siteTitle || artistProfile?.name || 'A';

    const bg = (current.colorBg || '#0c0a14').replace('#', '');
    const color = (current.colorText || '#f4f4f5').replace('#', '');

    // Fetch initials image from UI Avatars API
    const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=${bg}&color=${color}&size=512&bold=true&format=png&rounded=${rounded}&length=${length}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch avatar from UI Avatars');
    const sourceBuffer = Buffer.from(await response.arrayBuffer());

    const sizes = [
      { name: 'favicon-16.png', size: 16 },
      { name: 'favicon-32.png', size: 32 },
      { name: 'favicon-48.png', size: 48 },
      { name: 'apple-touch-icon.png', size: 180 },
      { name: 'icon-192.png', size: 192 },
      { name: 'icon-512.png', size: 512 }
    ];

    const generatedImages: { name: string; size: number; buffer: Buffer }[] = [];

    for (const { name, size } of sizes) {
      const buffer = await sharp(sourceBuffer)
        .resize(size, size, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

      generatedImages.push({ name, size, buffer });
      await writeFile(join(DATA_DIR, name), buffer);
    }

    // Create ICO file from 16, 32, 48 sizes
    const icoImages = generatedImages
      .filter((img) => [16, 32, 48].includes(img.size))
      .map((img) => ({ size: img.size, buffer: img.buffer }));

    const icoBuffer = createIco(icoImages);
    await writeFile(join(DATA_DIR, 'favicon.ico'), icoBuffer);

    // Update settings
    await updateSiteSettings({
      faviconUrl: null,
      faviconGenerated: true
    });

    return { success: true };
  }
);

// ============================================================================
// SMTP Settings Commands
// ============================================================================

export const updateSmtpSettings = command(smtpSettingsSchema, async (data) => {
  await requireAdmin();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  await updateSiteSettings(updates);

  return { success: true };
});

export const testSmtp = command(v.object({}), async () => {
  await requireAdmin();

  const result = await testSmtpConnection();
  return result;
});
