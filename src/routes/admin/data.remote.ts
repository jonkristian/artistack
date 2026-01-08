import * as v from 'valibot';
import { form, command } from '$app/server';
import { db } from '$lib/server/db';
import { profile, links, tourDates } from '$lib/server/schema';
import { eq, asc } from 'drizzle-orm';
import {
	fetchYouTubeMetadata,
	isYouTubeUrl,
	extractYouTubeVideoId,
	fetchSpotifyMetadata,
	isSpotifyUrl,
	extractSpotifyEmbedInfo,
	fetchBandcampMetadata,
	isBandcampUrl,
	detectPlatformFromUrl
} from '$lib/server/oembed';
import type { SpotifyEmbedData, YouTubeEmbedData, BandcampEmbedData, EmbedData } from '$lib/server/schema';

// ============================================================================
// Validation Schemas
// ============================================================================

const profileSchema = v.object({
	name: v.pipe(v.string(), v.nonEmpty('Name is required')),
	bio: v.optional(v.string()),
	email: v.optional(v.string())
});

const linkSchema = v.object({
	url: v.pipe(v.string(), v.url('Please enter a valid URL')),
	category: v.optional(v.picklist(['social', 'streaming', 'merch', 'other'])),
	label: v.optional(v.string())
});

const tourDateSchema = v.object({
	date: v.pipe(v.string(), v.nonEmpty('Date is required')),
	venue: v.pipe(v.string(), v.nonEmpty('Venue is required')),
	city: v.pipe(v.string(), v.nonEmpty('City is required')),
	ticketUrl: v.optional(v.string())
});

const reorderSchema = v.array(
	v.object({
		id: v.number(),
		position: v.number()
	})
);

const idSchema = v.number();

// ============================================================================
// Helper Functions
// ============================================================================

function getNextPosition<T extends { position?: number | null }>(items: T[]): number {
	return items.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1;
}

async function getOrCreateProfile() {
	const [existing] = await db.select().from(profile).limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(profile)
		.values({ name: 'Artist Name' })
		.returning();
	return created;
}

// ============================================================================
// Profile Forms
// ============================================================================

export const updateProfile = form(profileSchema, async ({ name, bio, email }) => {
	const existing = await getOrCreateProfile();

	const [updated] = await db
		.update(profile)
		.set({ name, bio, email })
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});

// ============================================================================
// Link Forms & Commands
// ============================================================================

export const addLink = form(linkSchema, async ({ url, category, label }) => {
	// Auto-detect platform and category from URL if not provided
	let detectedPlatform: string | undefined;
	let detectedCategory = category;

	const detected = detectPlatformFromUrl(url);
	if (detected) {
		detectedPlatform = detected.platform;
		detectedCategory = detectedCategory || detected.category;
	} else {
		// Fallback to 'other' category and extract domain as platform
		detectedCategory = detectedCategory || 'other';
		try {
			const urlObj = new URL(url);
			detectedPlatform = urlObj.hostname.replace('www.', '').split('.')[0];
		} catch {
			detectedPlatform = 'link';
		}
	}

	// Auto-fetch metadata for supported URLs
	let thumbnailUrl: string | null = null;
	let fetchedLabel = label || null;
	let embedData: EmbedData | null = null;

	if (isYouTubeUrl(url)) {
		const metadata = await fetchYouTubeMetadata(url);
		if (metadata) {
			thumbnailUrl = metadata.thumbnailUrl;
			if (!fetchedLabel) fetchedLabel = metadata.title;
		}
		// Create YouTube embed data
		const videoId = extractYouTubeVideoId(url);
		if (videoId) {
			embedData = {
				platform: 'youtube',
				id: videoId,
				enabled: true
			} satisfies YouTubeEmbedData;
		}
	} else if (isSpotifyUrl(url)) {
		const metadata = await fetchSpotifyMetadata(url);
		if (metadata) {
			thumbnailUrl = metadata.thumbnailUrl;
			if (!fetchedLabel) fetchedLabel = metadata.title;
		}
		// Create Spotify embed data
		const spotifyInfo = extractSpotifyEmbedInfo(url);
		if (spotifyInfo) {
			embedData = {
				platform: 'spotify',
				id: spotifyInfo.id,
				type: spotifyInfo.type,
				enabled: true,
				theme: 'dark',
				compact: false
			} satisfies SpotifyEmbedData;
		}
	} else if (isBandcampUrl(url)) {
		const metadata = await fetchBandcampMetadata(url);
		if (metadata) {
			thumbnailUrl = metadata.thumbnailUrl;
			if (!fetchedLabel) fetchedLabel = metadata.title;
			if (metadata.embedId && metadata.embedType) {
				embedData = {
					platform: 'bandcamp',
					id: metadata.embedId,
					type: metadata.embedType,
					enabled: true,
					size: 'large',
					bgColor: null, // Use theme color
					linkColor: null, // Use theme color
					tracklist: true, // Show tracklist for visible play controls
					artwork: 'small'
				} satisfies BandcampEmbedData;
			}
		}
	}

	// Get next position
	const existing = await db.select().from(links);
	const position = getNextPosition(existing);

	const [created] = await db
		.insert(links)
		.values({
			category: detectedCategory || 'other',
			platform: detectedPlatform || 'link',
			url,
			label: fetchedLabel,
			thumbnailUrl,
			embedData,
			position,
			visible: true
		})
		.returning();

	return { success: true, link: created };
});

export const deleteLink = command(idSchema, async (id) => {
	const [deleted] = await db.delete(links).where(eq(links.id, id)).returning();

	if (!deleted) {
		throw new Error('Link not found');
	}

	return { success: true };
});

// Embed data schemas for different platforms
const bandcampEmbedSchema = v.object({
	platform: v.literal('bandcamp'),
	id: v.string(),
	type: v.picklist(['album', 'track']),
	enabled: v.optional(v.boolean()),
	size: v.optional(v.picklist(['small', 'large'])),
	bgColor: v.optional(v.nullable(v.string())),
	linkColor: v.optional(v.nullable(v.string())),
	tracklist: v.optional(v.boolean()),
	artwork: v.optional(v.picklist(['small', 'large', 'none']))
});

const spotifyEmbedSchema = v.object({
	platform: v.literal('spotify'),
	id: v.string(),
	type: v.picklist(['track', 'album', 'playlist', 'artist']),
	enabled: v.optional(v.boolean()),
	theme: v.optional(v.picklist(['dark', 'light'])),
	compact: v.optional(v.boolean())
});

const youtubeEmbedSchema = v.object({
	platform: v.literal('youtube'),
	id: v.string(),
	enabled: v.optional(v.boolean())
});

const updateLinkSchema = v.object({
	id: v.number(),
	label: v.optional(v.nullable(v.string())),
	url: v.optional(v.string()),
	embedData: v.optional(
		v.nullable(
			v.union([bandcampEmbedSchema, spotifyEmbedSchema, youtubeEmbedSchema])
		)
	)
});

export const updateLink = command(updateLinkSchema, async ({ id, label, url, embedData }) => {
	const updateData: Record<string, unknown> = {};

	if (label !== undefined) updateData.label = label;
	if (url !== undefined) updateData.url = url;
	if (embedData !== undefined) updateData.embedData = embedData;

	if (Object.keys(updateData).length === 0) {
		throw new Error('No fields to update');
	}

	const [updated] = await db
		.update(links)
		.set(updateData)
		.where(eq(links.id, id))
		.returning();

	if (!updated) {
		throw new Error('Link not found');
	}

	return { success: true, link: updated };
});

export const reorderLinks = command(reorderSchema, async (items) => {
	// Use a transaction-like approach - update all positions
	for (const item of items) {
		await db.update(links).set({ position: item.position }).where(eq(links.id, item.id));
	}

	return { success: true };
});

// ============================================================================
// Tour Date Forms & Commands
// ============================================================================

export const addTourDate = form(tourDateSchema, async ({ date, venue, city, ticketUrl }) => {
	// Get next position
	const existing = await db.select().from(tourDates);
	const position = getNextPosition(existing);

	const [created] = await db
		.insert(tourDates)
		.values({
			date,
			venue,
			city,
			ticketUrl: ticketUrl || null,
			soldOut: false,
			position
		})
		.returning();

	return { success: true, tourDate: created };
});

export const deleteTourDate = command(idSchema, async (id) => {
	const [deleted] = await db.delete(tourDates).where(eq(tourDates.id, id)).returning();

	if (!deleted) {
		throw new Error('Tour date not found');
	}

	return { success: true };
});

const updateTourDateSchema = v.object({
	id: v.number(),
	date: v.optional(v.string()),
	venue: v.optional(v.string()),
	city: v.optional(v.string()),
	ticketUrl: v.optional(v.nullable(v.string())),
	soldOut: v.optional(v.boolean())
});

export const updateTourDate = command(updateTourDateSchema, async ({ id, ...updates }) => {
	const updateData: Record<string, unknown> = {};

	if (updates.date !== undefined) updateData.date = updates.date;
	if (updates.venue !== undefined) updateData.venue = updates.venue;
	if (updates.city !== undefined) updateData.city = updates.city;
	if (updates.ticketUrl !== undefined) updateData.ticketUrl = updates.ticketUrl;
	if (updates.soldOut !== undefined) updateData.soldOut = updates.soldOut;

	if (Object.keys(updateData).length === 0) {
		throw new Error('No fields to update');
	}

	const [updated] = await db
		.update(tourDates)
		.set(updateData)
		.where(eq(tourDates.id, id))
		.returning();

	if (!updated) {
		throw new Error('Tour date not found');
	}

	return { success: true, tourDate: updated };
});

// ============================================================================
// Image URL Commands (used by ImageUpload component after file upload)
// ============================================================================

const imageUrlSchema = v.object({
	type: v.picklist(['logo', 'photo', 'background']),
	url: v.nullable(v.string()),
	shape: v.optional(v.picklist(['circle', 'rounded', 'square', 'wide', 'wide-rounded']))
});

export const updateProfileImage = command(imageUrlSchema, async ({ type, url, shape }) => {
	const existing = await getOrCreateProfile();

	const urlFieldMap = {
		logo: 'logoUrl',
		photo: 'photoUrl',
		background: 'backgroundUrl'
	} as const;

	const shapeFieldMap = {
		logo: 'logoShape',
		photo: 'photoShape',
		background: null // background doesn't have shape
	} as const;

	const updateData: Record<string, unknown> = {
		[urlFieldMap[type]]: url
	};

	// Also update shape if provided (and field exists)
	const shapeField = shapeFieldMap[type];
	if (shape && shapeField) {
		updateData[shapeField] = shape;
	}

	const [updated] = await db
		.update(profile)
		.set(updateData)
		.where(eq(profile.id, existing.id))
		.returning();

	return { success: true, profile: updated };
});
