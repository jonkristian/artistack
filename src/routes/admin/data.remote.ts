import { error } from '@sveltejs/kit';
import { getSettings, updateSiteSettings } from '$lib/server/settings';
import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { form, command } from '$app/server';
import { db } from '$lib/server/db';
import { profile, links, tourDates, blocks, settings, pages } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import {
  fetchYouTubeMetadata,
  isYouTubeUrl,
  extractYouTubeVideoId,
  fetchSpotifyMetadata,
  isSpotifyUrl,
  extractSpotifyEmbedInfo,
  fetchBandcampMetadata,
  isBandcampUrl,
  isGitHubRepoUrl,
  extractGitHubRepoInfo,
  fetchGitHubMetadata,
  detectPlatformFromUrl
} from '$lib/server/oembed';
import type {
  SpotifyEmbedData,
  YouTubeEmbedData,
  BandcampEmbedData,
  RepoEmbedData,
  EmbedData
} from '$lib/server/schema';

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
  blockId: v.optional(v.number()),
  category: v.optional(v.picklist(['social', 'streaming', 'merch', 'other'])),
  label: v.optional(v.string())
});

const venueSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('Venue name is required')),
  city: v.pipe(v.string(), v.nonEmpty('City is required')),
  address: v.optional(v.string()),
  placeId: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number())
});

// For form submission (separate fields that get combined)
const tourDateFormSchema = v.object({
  date: v.pipe(v.string(), v.nonEmpty('Date is required')),
  time: v.optional(v.string()),
  title: v.optional(v.string()),
  venueName: v.pipe(v.string(), v.nonEmpty('Venue is required')),
  venueCity: v.pipe(v.string(), v.nonEmpty('City is required')),
  lineup: v.optional(v.string()),
  ticketUrl: v.optional(v.string()),
  eventUrl: v.optional(v.string()),
  blockId: v.optional(v.number())
});

const reorderSchema = v.array(
  v.object({
    id: v.number(),
    position: v.number()
  })
);

const idSchema = v.number();

// ============================================================================
// Block Schemas
// ============================================================================

const addBlockSchema = v.object({
  type: v.picklist(['profile', 'links', 'tour_dates', 'image', 'gallery']),
  label: v.optional(v.string()),
  config: v.optional(v.any())
});

const updateBlockSchema = v.object({
  id: v.number(),
  label: v.optional(v.string()),
  config: v.optional(v.any()),
  visible: v.optional(v.boolean())
});

const deleteBlockSchema = v.number();

const reorderBlocksSchema = v.array(
  v.object({
    id: v.number(),
    position: v.number()
  })
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Shared helper: fetch metadata and build embedData for supported platform URLs
 */
async function fetchPlatformMetadata(
  url: string,
  existingLabel: string | null
): Promise<{
  thumbnailUrl: string | null;
  label: string | null;
  embedData: EmbedData | null;
}> {
  let thumbnailUrl: string | null = null;
  let label = existingLabel;
  let embedData: EmbedData | null = null;

  if (isYouTubeUrl(url)) {
    const metadata = await fetchYouTubeMetadata(url);
    if (metadata) {
      thumbnailUrl = metadata.thumbnailUrl;
      if (!label) label = metadata.title;
    }
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
      if (!label) label = metadata.title;
    }
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
      if (!label) label = metadata.title;
      if (metadata.embedId && metadata.embedType) {
        embedData = {
          platform: 'bandcamp',
          id: metadata.embedId,
          type: metadata.embedType,
          enabled: true,
          size: 'large',
          bgColor: null,
          linkColor: null,
          tracklist: false,
          artwork: 'small'
        } satisfies BandcampEmbedData;
      }
    }
  } else if (isGitHubRepoUrl(url)) {
    const repoInfo = extractGitHubRepoInfo(url);
    if (repoInfo) {
      const metadata = await fetchGitHubMetadata(url);
      if (metadata) {
        if (!label) label = metadata.name;
        thumbnailUrl = metadata.avatarUrl || null;
        embedData = {
          platform: 'github',
          id: `${repoInfo.owner}/${repoInfo.repo}`,
          enabled: true,
          description: metadata.description,
          language: metadata.language,
          stars: metadata.stars,
          forks: metadata.forks,
          topics: metadata.topics,
          avatarUrl: metadata.avatarUrl
        } satisfies RepoEmbedData;
      }
    }
  }

  return { thumbnailUrl, label, embedData };
}

function getNextPosition<T extends { position?: number | null }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1;
}

async function getOrCreateProfile() {
  const [existing] = await db.select().from(profile).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(profile).values({ name: 'Artist Name' }).returning();
  return created;
}

// ============================================================================
// Block Commands
// ============================================================================

export const addBlock = command(addBlockSchema, async ({ type, label, config }) => {
  await requireUser();

  const existing = await db.select().from(blocks);
  const position = getNextPosition(existing);

  /*
   * Blocks belong to the artist page. NULL used to mean the same thing, but
   * every existing block was attached to its `pages` row when pages became the
   * routing table — leaving new ones NULL would split the data across two
   * conventions for the same fact.
   */
  const [landing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.type, 'landing'))
    .limit(1);

  const [created] = await db
    .insert(blocks)
    .values({
      pageId: landing?.id ?? null,
      type,
      label: label || null,
      config: config || null,
      position,
      visible: true
    })
    .returning();

  return { success: true, block: created };
});

export const updateBlock = command(updateBlockSchema, async ({ id, label, config, visible }) => {
  await requireUser();

  const updateData: Record<string, unknown> = {};

  if (label !== undefined) updateData.label = label;
  if (config !== undefined) updateData.config = config;
  if (visible !== undefined) updateData.visible = visible;

  if (Object.keys(updateData).length === 0) {
    throw new Error('No fields to update');
  }

  const [updated] = await db.update(blocks).set(updateData).where(eq(blocks.id, id)).returning();

  if (!updated) {
    throw new Error('Block not found');
  }

  return { success: true, block: updated };
});

export const deleteBlock = command(deleteBlockSchema, async (id) => {
  await requireUser();

  // Delete associated links and tour dates
  await db.delete(links).where(eq(links.blockId, id));
  await db.delete(tourDates).where(eq(tourDates.blockId, id));

  const [deleted] = await db.delete(blocks).where(eq(blocks.id, id)).returning();

  if (!deleted) {
    throw new Error('Block not found');
  }

  return { success: true };
});

export const reorderBlocks = command(reorderBlocksSchema, async (items) => {
  await requireUser();

  for (const item of items) {
    await db.update(blocks).set({ position: item.position }).where(eq(blocks.id, item.id));
  }

  return { success: true };
});

// ============================================================================
// Profile Forms
// ============================================================================

export const updateProfile = form(profileSchema, async ({ name, bio, email }) => {
  await requireUser();

  const existing = await getOrCreateProfile();

  const [updated] = await db
    .update(profile)
    .set({ name, bio, email })
    .where(eq(profile.id, existing.id))
    .returning();

  return { success: true, profile: updated };
});

export const saveProfile = command(profileSchema, async ({ name, bio, email }) => {
  await requireUser();

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

export const addLink = form(linkSchema, async ({ url, blockId, category, label }) => {
  await requireUser();

  // If no blockId provided, find or create a links block
  if (!blockId) {
    const [existingBlock] = await db.select().from(blocks).where(eq(blocks.type, 'links')).limit(1);
    if (existingBlock) {
      blockId = existingBlock.id;
    } else {
      const allBlocks = await db.select().from(blocks);
      const position = getNextPosition(allBlocks);
      const [newBlock] = await db
        .insert(blocks)
        .values({
          type: 'links',
          label: 'Links',
          position,
          visible: true
        })
        .returning();
      blockId = newBlock.id;
    }
  }

  // Auto-detect platform and category from URL if not provided
  let detectedPlatform: string | undefined;
  let detectedCategory = category;

  const detected = detectPlatformFromUrl(url);
  if (detected) {
    detectedPlatform = detected.platform;
    const mappedCategory = detected.category === 'event' ? 'other' : detected.category;
    detectedCategory = detectedCategory || mappedCategory;
  } else {
    detectedCategory = detectedCategory || 'other';
    try {
      const urlObj = new URL(url);
      detectedPlatform = urlObj.hostname.replace('www.', '').split('.')[0];
    } catch {
      detectedPlatform = 'link';
    }
  }

  // Auto-fetch metadata for supported URLs
  const fetched = await fetchPlatformMetadata(url, label || null);

  // Get next position
  const existing = await db.select().from(links);
  const position = getNextPosition(existing);

  const [created] = await db
    .insert(links)
    .values({
      blockId,
      category: detectedCategory || 'other',
      platform: detectedPlatform || 'link',
      url,
      label: fetched.label,
      thumbnailUrl: fetched.thumbnailUrl,
      embedData: fetched.embedData,
      position,
      visible: true
    })
    .returning();

  return { success: true, link: created };
});

export const deleteLink = command(idSchema, async (id) => {
  await requireUser();

  const [deleted] = await db.delete(links).where(eq(links.id, id)).returning();

  if (!deleted) {
    throw new Error('Link not found');
  }

  return { success: true };
});

// Command version of addLink for programmatic use
/**
 * A link hangs off a block on the artist page, or off a release. Exactly one
 * owner is given; the other stays null. Both go through this command so URL
 * detection, metadata fetching and positioning behave identically wherever a
 * link is added.
 */
const createLinkSchema = v.object({
  url: v.pipe(v.string(), v.url('Please enter a valid URL')),
  blockId: v.optional(v.number()),
  releaseId: v.optional(v.number()),
  category: v.optional(v.picklist(['social', 'streaming', 'merch', 'other'])),
  platform: v.optional(v.string()),
  label: v.optional(v.string())
});

export const createLink = command(
  createLinkSchema,
  async ({ url, blockId, releaseId, category, platform, label }) => {
    await requireUser();

    if (blockId == null && releaseId == null) {
      error(400, 'A link needs a block or a release to belong to.');
    }

    // Auto-detect platform and category from URL if not provided
    let detectedPlatform: string | undefined = platform;
    let detectedCategory = category;

    if (!detectedPlatform) {
      const detected = detectPlatformFromUrl(url);
      if (detected) {
        detectedPlatform = detected.platform;
        const mappedCategory = detected.category === 'event' ? 'other' : detected.category;
        detectedCategory = detectedCategory || mappedCategory;
      } else {
        detectedCategory = detectedCategory || 'other';
        try {
          const urlObj = new URL(url);
          detectedPlatform = urlObj.hostname.replace('www.', '').split('.')[0];
        } catch {
          detectedPlatform = 'link';
        }
      }
    } else if (!detectedCategory) {
      const detected = detectPlatformFromUrl(url);
      detectedCategory = detected?.category === 'event' ? 'other' : detected?.category || 'other';
    }

    // Auto-fetch metadata for supported URLs
    const fetched = await fetchPlatformMetadata(url, label || null);

    // Position within the owner, not across every link in the database — a
    // release's first link is 0 even when the artist page already has twenty.
    const existing = await db
      .select()
      .from(links)
      .where(releaseId != null ? eq(links.releaseId, releaseId) : eq(links.blockId, blockId!));
    const position = getNextPosition(existing);

    const [created] = await db
      .insert(links)
      .values({
        blockId: blockId ?? null,
        releaseId: releaseId ?? null,
        category: detectedCategory || 'other',
        platform: detectedPlatform || 'link',
        url,
        label: fetched.label,
        thumbnailUrl: fetched.thumbnailUrl,
        embedData: fetched.embedData,
        position,
        visible: true
      })
      .returning();

    return { success: true, link: created };
  }
);

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

const repoEmbedSchema = v.object({
  platform: v.picklist(['github', 'gitlab', 'codeberg']),
  id: v.string(),
  enabled: v.optional(v.boolean()),
  showAvatar: v.optional(v.boolean()),
  descriptionDisplay: v.optional(v.picklist(['truncate', 'full'])),
  description: v.optional(v.nullable(v.string())),
  language: v.optional(v.nullable(v.string())),
  stars: v.optional(v.number()),
  forks: v.optional(v.number()),
  topics: v.optional(v.array(v.string())),
  avatarUrl: v.optional(v.string())
});

const updateLinkSchema = v.object({
  id: v.number(),
  label: v.optional(v.nullable(v.string())),
  url: v.optional(v.string()),
  embedData: v.optional(
    v.nullable(
      v.union([bandcampEmbedSchema, spotifyEmbedSchema, youtubeEmbedSchema, repoEmbedSchema])
    )
  )
});

export const updateLink = command(updateLinkSchema, async ({ id, label, url, embedData }) => {
  await requireUser();

  const updateData: Record<string, unknown> = {};

  if (label !== undefined) updateData.label = label;
  if (url !== undefined) updateData.url = url;
  if (embedData !== undefined) updateData.embedData = embedData;

  if (Object.keys(updateData).length === 0) {
    throw new Error('No fields to update');
  }

  const [updated] = await db.update(links).set(updateData).where(eq(links.id, id)).returning();

  if (!updated) {
    throw new Error('Link not found');
  }

  return { success: true, link: updated };
});

export const reorderLinks = command(reorderSchema, async (items) => {
  await requireUser();

  for (const item of items) {
    await db.update(links).set({ position: item.position }).where(eq(links.id, item.id));
  }

  return { success: true };
});

// ============================================================================
// Tour Date Forms & Commands
// ============================================================================

export const addTourDate = form(
  tourDateFormSchema,
  async ({ date, time, title, venueName, venueCity, lineup, ticketUrl, eventUrl, blockId }) => {
    await requireUser();

    // If no blockId provided, find or create a tour_dates block
    if (!blockId) {
      const [existingBlock] = await db
        .select()
        .from(blocks)
        .where(eq(blocks.type, 'tour_dates'))
        .limit(1);
      if (existingBlock) {
        blockId = existingBlock.id;
      } else {
        const allBlocks = await db.select().from(blocks);
        const position = getNextPosition(allBlocks);
        const [newBlock] = await db
          .insert(blocks)
          .values({
            type: 'tour_dates',
            label: 'Tour Dates',
            position,
            visible: true
          })
          .returning();
        blockId = newBlock.id;
      }
    }

    // Get next position
    const existing = await db.select().from(tourDates);
    const position = getNextPosition(existing);

    const venue = {
      name: venueName,
      city: venueCity
    };

    const [created] = await db
      .insert(tourDates)
      .values({
        blockId,
        date,
        time: time || null,
        title: title || null,
        venue,
        lineup: lineup || null,
        ticketUrl: ticketUrl || null,
        eventUrl: eventUrl || null,
        soldOut: false,
        position
      })
      .returning();

    return { success: true, tourDate: created };
  }
);

export const deleteTourDate = command(idSchema, async (id) => {
  await requireUser();

  const [deleted] = await db.delete(tourDates).where(eq(tourDates.id, id)).returning();

  if (!deleted) {
    throw new Error('Tour date not found');
  }

  return { success: true };
});

const createTourDateSchema = v.object({
  date: v.pipe(v.string(), v.nonEmpty('Date is required')),
  time: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(v.string())),
  venue: venueSchema,
  lineup: v.optional(v.nullable(v.string())),
  ticketUrl: v.optional(v.nullable(v.string())),
  eventUrl: v.optional(v.nullable(v.string())),
  soldOut: v.optional(v.boolean()),
  blockId: v.optional(v.number())
});

export const createTourDate = command(createTourDateSchema, async (data) => {
  await requireUser();

  let blockId = data.blockId;

  // If no blockId provided, find or create a tour_dates block
  if (!blockId) {
    const [existingBlock] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.type, 'tour_dates'))
      .limit(1);
    if (existingBlock) {
      blockId = existingBlock.id;
    } else {
      const allBlocks = await db.select().from(blocks);
      const position = getNextPosition(allBlocks);
      const [newBlock] = await db
        .insert(blocks)
        .values({
          type: 'tour_dates',
          label: 'Tour Dates',
          position,
          visible: true
        })
        .returning();
      blockId = newBlock.id;
    }
  }

  const existing = await db.select().from(tourDates);
  const position = getNextPosition(existing);

  const [created] = await db
    .insert(tourDates)
    .values({
      blockId,
      date: data.date,
      time: data.time || null,
      title: data.title || null,
      venue: data.venue,
      lineup: data.lineup || null,
      ticketUrl: data.ticketUrl || null,
      eventUrl: data.eventUrl || null,
      soldOut: data.soldOut || false,
      position
    })
    .returning();

  return { success: true, tourDate: created };
});

const updateTourDateSchema = v.object({
  id: v.number(),
  date: v.optional(v.string()),
  time: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(v.string())),
  venue: v.optional(venueSchema),
  lineup: v.optional(v.nullable(v.string())),
  ticketUrl: v.optional(v.nullable(v.string())),
  eventUrl: v.optional(v.nullable(v.string())),
  soldOut: v.optional(v.boolean())
});

export const updateTourDate = command(updateTourDateSchema, async ({ id, ...updates }) => {
  await requireUser();

  const updateData: Record<string, unknown> = {};

  if (updates.date !== undefined) updateData.date = updates.date;
  if (updates.time !== undefined) updateData.time = updates.time;
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.venue !== undefined) updateData.venue = updates.venue;
  if (updates.lineup !== undefined) updateData.lineup = updates.lineup;
  if (updates.ticketUrl !== undefined) updateData.ticketUrl = updates.ticketUrl;
  if (updates.eventUrl !== undefined) updateData.eventUrl = updates.eventUrl;
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
// Setup Command (initial onboarding)
// ============================================================================

const setupSchema = v.object({
  siteTitle: v.optional(v.string()),
  locale: v.string()
});

export const completeSetup = command(setupSchema, async ({ siteTitle, locale }) => {
  await requireUser();

  // Update settings
  await updateSiteSettings({
    siteTitle: siteTitle || null,
    locale,
    setupCompleted: true
  });

  // Update profile name if siteTitle provided
  if (siteTitle) {
    const existingProfile = await getOrCreateProfile();
    await db.update(profile).set({ name: siteTitle }).where(eq(profile.id, existingProfile.id));
  }

  // Create Profile block if none exists
  const existingBlocks = await db.select().from(blocks);

  if (existingBlocks.length === 0) {
    await db.insert(blocks).values({
      type: 'profile',
      label: 'Profile',
      position: 0,
      visible: true,
      config: {
        showName: true,
        showBio: true
      }
    });
  }

  return { success: true };
});

// ============================================================================
// Block UI State (saves immediately, not through draft)
// ============================================================================

const toggleCollapsedSchema = v.object({
  id: v.pipe(v.number(), v.minValue(1)),
  collapsed: v.boolean()
});

export const toggleBlockCollapsed = command(toggleCollapsedSchema, async ({ id, collapsed }) => {
  await requireUser();

  await db.update(blocks).set({ collapsed }).where(eq(blocks.id, id));
  return { success: true };
});
