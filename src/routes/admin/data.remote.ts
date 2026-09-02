import { BLOCK_TYPES } from '$lib/blocks/kinds';
import { error } from '@sveltejs/kit';
import { getSettings, updateSiteSettings } from '$lib/server/settings';
import { requireUser } from '$lib/server/guards';
import { uniqueSlug, createPageRow } from '$lib/server/page-slug';
import { getNextPosition } from '$lib/server/api';
import * as v from 'valibot';
import { form, command } from '$app/server';
import { db } from '$lib/server/db';
import { profile, links, shows, showActs, acts, blocks, settings, pages } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
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
const showFormSchema = v.object({
  date: v.pipe(v.string(), v.nonEmpty('Date is required')),
  title: v.optional(v.string()),
  venueName: v.pipe(v.string(), v.nonEmpty('Venue is required')),
  venueCity: v.pipe(v.string(), v.nonEmpty('City is required')),
  ticketUrl: v.optional(v.string()),
  eventUrl: v.optional(v.string())
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
  pageId: v.number(),
  type: v.picklist(BLOCK_TYPES),
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

/**
 * The artist page's id.
 *
 * Blocks that get created as a side effect — the links block conjured when a
 * link arrives with nowhere to go — belong to the front page. They have to say
 * so: a block with no page is on no page at all now that pages are plural.
 */
async function getLandingPageId(): Promise<number> {
  const [landing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.type, 'landing'))
    .limit(1);
  if (!landing) {
    error(500, 'The site has no front page.');
  }
  return landing.id;
}

/**
 * Replace a show's line-up wholesale.
 *
 * Rewritten rather than diffed: a line-up is a handful of rows whose order is
 * the point, and working out which of them moved costs more than writing the
 * short list again.
 */
async function setShowActs(showId: number, lineup: { actId: number; setTime?: string | null }[]) {
  await db.delete(showActs).where(eq(showActs.showId, showId));
  if (lineup.length === 0) return;

  // Deduped: the same act twice on one night is a mis-click, and the primary
  // key would reject it anyway. First occurrence wins, so its set time and
  // place in the running order are the ones kept.
  const seen = new Set<number>();
  const rows = lineup
    .filter((entry) => (seen.has(entry.actId) ? false : (seen.add(entry.actId), true)))
    .map((entry, position) => ({
      showId,
      actId: entry.actId,
      position,
      setTime: entry.setTime ?? null
    }));

  await db.insert(showActs).values(rows);
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

export const addBlock = command(addBlockSchema, async ({ pageId, type, label, config }) => {
  await requireUser();

  const [page] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) {
    error(404, 'That page no longer exists.');
  }

  /*
   * Position is counted within the page. Measuring it against the whole table
   * would order a new block by when the site last gained one rather than by
   * where it sits on the page it belongs to.
   *
   * `pageId` is always a real id — NULL used to mean the artist page, but
   * every block was attached to its `pages` row when pages became the routing
   * table, and keeping the old convention alive would split one fact across
   * two spellings.
   */
  const existing = await db.select().from(blocks).where(eq(blocks.pageId, pageId));
  const position = getNextPosition(existing);

  const [created] = await db
    .insert(blocks)
    .values({
      pageId,
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

  /*
   * Links belong to their block, so they go with it. Shows don't — they're the
   * site's, and a tour dates block is one way of displaying them. Deleting the
   * block that showed them used to delete the tour.
   */
  await db.delete(links).where(eq(links.blockId, id));

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
    const landingId = await getLandingPageId();
    const [existingBlock] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.type, 'links'), eq(blocks.pageId, landingId)))
      .limit(1);
    if (existingBlock) {
      blockId = existingBlock.id;
    } else {
      const pageBlocks = await db.select().from(blocks).where(eq(blocks.pageId, landingId));
      const position = getNextPosition(pageBlocks);
      const [newBlock] = await db
        .insert(blocks)
        .values({
          pageId: landingId,
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

/**
 * Turn a show's landing page on or off.
 *
 * One switch: either the show is at an address or it isn't. Switching it off
 * unpublishes rather than deleting — the slug survives, so a link already in
 * circulation still points at the same place if it comes back.
 *
 * Immediate rather than staged, unlike the fields on the show: this creates a
 * row that owns a public URL, which isn't something to leave pending.
 */
export const setShowPage = command(
  v.object({ showId: v.number(), enabled: v.boolean() }),
  async ({ showId, enabled }) => {
    await requireUser();

    const [show] = await db.select().from(shows).where(eq(shows.id, showId)).limit(1);
    if (!show) error(404, 'That show no longer exists.');

    if (show.pageId) {
      await db.update(pages).set({ published: enabled }).where(eq(pages.id, show.pageId));
      return { success: true, pageId: show.pageId };
    }

    if (!enabled) return { success: true, pageId: null };

    /*
     * Derived from venue and date because a show has no title of its own, and
     * a venue alone collides the second time you play there. Suffixed rather
     * than refused — nobody typed this, so an error about it would be about a
     * choice they didn't make.
     */
    const slug = await uniqueSlug(`${show.venue.name} ${show.date}`);
    const page = await createPageRow({
      slug,
      title: show.title || `${show.venue.name}, ${show.venue.city}`,
      type: 'show',
      published: true
    });

    await db.update(shows).set({ pageId: page.id }).where(eq(shows.id, showId));

    return { success: true, pageId: page.id };
  }
);

// ============================================================================
// Acts
// ============================================================================

/**
 * Created from wherever an act is first needed, which in practice is halfway
 * through entering a gig. An existing name returns the existing row rather
 * than failing: two people typing "The How" mean the same act, and the unique
 * index would reject the second anyway.
 */
export const createAct = command(
  v.object({ name: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the act a name')) }),
  async ({ name }) => {
    await requireUser();

    const [existing] = await db.select().from(acts).where(eq(acts.name, name)).limit(1);
    if (existing) return { act: existing };

    const [created] = await db.insert(acts).values({ name }).returning();
    return { act: created };
  }
);

export const updateAct = command(
  v.object({
    id: v.number(),
    name: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty('Give the act a name'))),
    logoUrl: v.optional(v.nullable(v.string()))
  }),
  async ({ id, ...updates }) => {
    await requireUser();

    const changes: Record<string, unknown> = {};
    if (updates.name !== undefined) changes.name = updates.name;
    if (updates.logoUrl !== undefined) changes.logoUrl = updates.logoUrl;
    if (Object.keys(changes).length === 0) return { success: true };

    await db.update(acts).set(changes).where(eq(acts.id, id));
    return { success: true };
  }
);

export const deleteAct = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  const [act] = await db.select().from(acts).where(eq(acts.id, id)).limit(1);
  if (!act) error(404, 'That act no longer exists.');

  // The site's own act is referenced by the profile it mirrors; removing it
  // would leave the line-ups it appears in unable to say who played.
  if (act.isSelf) {
    error(400, 'This is your own act and cannot be deleted.');
  }

  // Its place in any line-up goes with it — a show can't list an act that
  // doesn't exist, and the running order closes up around the gap.
  await db.delete(showActs).where(eq(showActs.actId, id));
  await db.delete(acts).where(eq(acts.id, id));

  return { success: true };
});

// ============================================================================
// Show Forms & Commands
// ============================================================================

export const addShow = form(
  showFormSchema,
  async ({ date, title, venueName, venueCity, ticketUrl, eventUrl }) => {
    await requireUser();

    // Get next position
    const existing = await db.select().from(shows);
    const position = getNextPosition(existing);

    const venue = {
      name: venueName,
      city: venueCity
    };

    const [created] = await db
      .insert(shows)
      .values({
        date,
        title: title || null,
        venue,
        ticketUrl: ticketUrl || null,
        eventUrl: eventUrl || null,
        soldOut: false,
        position
      })
      .returning();

    return { success: true, show: created };
  }
);

export const deleteShow = command(idSchema, async (id) => {
  await requireUser();

  const [deleted] = await db.delete(shows).where(eq(shows.id, id)).returning();

  if (!deleted) {
    throw new Error('Show not found');
  }

  return { success: true };
});

const createShowSchema = v.object({
  date: v.pipe(v.string(), v.nonEmpty('Date is required')),
  doorsTime: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(v.string())),
  venue: venueSchema,
  lineup: v.optional(
    v.array(v.object({ actId: v.number(), setTime: v.optional(v.nullable(v.string())) }))
  ),
  ticketUrl: v.optional(v.nullable(v.string())),
  eventUrl: v.optional(v.nullable(v.string())),
  soldOut: v.optional(v.boolean()),
  imageUrl: v.optional(v.nullable(v.string()))
});

export const createShow = command(createShowSchema, async (data) => {
  await requireUser();

  const existing = await db.select().from(shows);
  const position = getNextPosition(existing);

  const [created] = await db
    .insert(shows)
    .values({
      date: data.date,
      doorsTime: data.doorsTime || null,
      title: data.title || null,
      venue: data.venue,
      ticketUrl: data.ticketUrl || null,
      eventUrl: data.eventUrl || null,
      soldOut: data.soldOut || false,
      imageUrl: data.imageUrl || null,
      position
    })
    .returning();

  await setShowActs(created.id, data.lineup ?? []);

  return { success: true, show: created };
});

const updateShowSchema = v.object({
  id: v.number(),
  date: v.optional(v.string()),
  doorsTime: v.optional(v.nullable(v.string())),
  title: v.optional(v.nullable(v.string())),
  venue: v.optional(venueSchema),
  lineup: v.optional(
    v.array(v.object({ actId: v.number(), setTime: v.optional(v.nullable(v.string())) }))
  ),
  ticketUrl: v.optional(v.nullable(v.string())),
  eventUrl: v.optional(v.nullable(v.string())),
  soldOut: v.optional(v.boolean()),
  imageUrl: v.optional(v.nullable(v.string()))
});

export const updateShow = command(updateShowSchema, async ({ id, ...updates }) => {
  await requireUser();

  const updateData: Record<string, unknown> = {};

  if (updates.date !== undefined) updateData.date = updates.date;
  if (updates.doorsTime !== undefined) updateData.doorsTime = updates.doorsTime;
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.venue !== undefined) updateData.venue = updates.venue;

  if (updates.ticketUrl !== undefined) updateData.ticketUrl = updates.ticketUrl;
  if (updates.eventUrl !== undefined) updateData.eventUrl = updates.eventUrl;
  if (updates.soldOut !== undefined) updateData.soldOut = updates.soldOut;
  if (updates.imageUrl !== undefined) updateData.imageUrl = updates.imageUrl;

  /*
   * The line-up lives in the join table, so changing only a running order or a
   * set time leaves every column on the show untouched. Treating that as
   * "nothing to update" failed the publish after the line-up had already been
   * written.
   */
  const lineupChanged = updates.lineup !== undefined;
  if (lineupChanged) {
    await setShowActs(id, updates.lineup!);
  }

  if (Object.keys(updateData).length === 0) {
    if (lineupChanged) return { success: true };
    throw new Error('No fields to update');
  }

  const [updated] = await db.update(shows).set(updateData).where(eq(shows.id, id)).returning();

  if (!updated) {
    throw new Error('Show not found');
  }

  return { success: true, show: updated };
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
