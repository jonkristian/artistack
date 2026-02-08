import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { profile, settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { testSmtpConnection } from '$lib/server/email';

// ============================================================================
// Validation Schemas
// ============================================================================

const settingsSchema = v.object({
  siteTitle: v.optional(v.nullable(v.string())),
  locale: v.optional(v.string()),
  pressKitEnabled: v.optional(v.boolean())
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

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(settings).values({}).returning();
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
  const existing = await getOrCreateSettings();

  // Filter out undefined values
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const [updated] = await db
    .update(settings)
    .set(updates)
    .where(eq(settings.id, existing.id))
    .returning();

  return { success: true, settings: updated };
});

// ============================================================================
// Favicon Generation Command
// ============================================================================

export const generateFavicon = command(generateFaviconSchema, async ({ sourceUrl }) => {
  const existing = await getOrCreateSettings();

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

  // Update settings
  const [updated] = await db
    .update(settings)
    .set({
      faviconUrl: sourceUrl,
      faviconGenerated: true
    })
    .where(eq(settings.id, existing.id))
    .returning();

  return { success: true, settings: updated };
});

// ============================================================================
// Favicon from Initials Command
// ============================================================================

export const generateFaviconFromInitials = command(v.object({}), async () => {
  const existing = await getOrCreateSettings();
  const [artistProfile] = await db.select().from(profile).limit(1);

  // Determine display name and initials
  const displayName = existing.siteTitle || artistProfile?.name || 'A';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const bgHex = existing.colorBg || '#0c0a14';
  const textColor = existing.colorText || '#f4f4f5';

  // Parse hex color to RGBA object for sharp
  function hexToRgba(hex: string) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 1 };
  }

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
    const fontPt = initials.length === 1 ? Math.round(size * 0.5) : Math.round(size * 0.38);

    // Render text using sharp's Pango text input (reliable font fallback)
    const textImage = await sharp({
      text: {
        text: `<span foreground="${textColor}" weight="bold">${initials}</span>`,
        font: `sans-serif ${fontPt}`,
        rgba: true
      }
    })
      .png()
      .toBuffer();

    // Create background and composite text centered
    const buffer = await sharp({
      create: { width: size, height: size, channels: 4, background: hexToRgba(bgHex) }
    })
      .composite([{ input: textImage, gravity: 'centre' }])
      .png()
      .toBuffer();

    generatedImages.push({ name, size, buffer });
    await writeFile(join('data', name), buffer);
  }

  // Create ICO file from 16, 32, 48 sizes
  const icoImages = generatedImages
    .filter((img) => [16, 32, 48].includes(img.size))
    .map((img) => ({ size: img.size, buffer: img.buffer }));

  const icoBuffer = createIco(icoImages);
  await writeFile(join('data', 'favicon.ico'), icoBuffer);

  // Update settings
  const [updated] = await db
    .update(settings)
    .set({
      faviconUrl: null,
      faviconGenerated: true
    })
    .where(eq(settings.id, existing.id))
    .returning();

  return { success: true, settings: updated };
});

// ============================================================================
// SMTP Settings Commands
// ============================================================================

export const updateSmtpSettings = command(smtpSettingsSchema, async (data) => {
  const existing = await getOrCreateSettings();

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const [updated] = await db
    .update(settings)
    .set(updates)
    .where(eq(settings.id, existing.id))
    .returning();

  return { success: true, settings: updated };
});

export const testSmtp = command(v.object({}), async () => {
  const result = await testSmtpConnection();
  return result;
});
