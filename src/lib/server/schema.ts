import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ClipRenderConfig, TimedCaption, ClipStatus } from '../clips/types';

// Clip config types live in $lib/clips/types so the admin UI can import the
// defaults at runtime; re-exported here so server code has one import site.
export type {
  TimedCaption,
  ClipStatus,
  ClipAspect,
  ClipTone,
  ClipFill,
  CaptionPosition,
  ClipRenderConfig
} from '../clips/types';
export { DEFAULT_CLIP_CONFIG } from '../clips/types';

// Artist profile (single row for single-artist setup)
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  bio: text('bio'),
  email: text('email')
});

// Site/app settings (single row singleton)
/**
 * Every setting, one row each.
 *
 * Columns were the wrong shape twice over. A 59-column singleton mixed theme
 * colours with SMTP credentials, so a public `select *` shipped the credentials
 * to every visitor; splitting it into six typed tables fixed that but still
 * needed a migration for every new setting, and SQLite doesn't enforce column
 * types anyway — an INTEGER column stores 'abc' happily unless the table is
 * STRICT, which none were.
 *
 * So the types come from valibot at the boundary instead, where they can be
 * checked at runtime as well as compile time, and adding a setting stops
 * needing a schema change at all.
 *
 * `secret` is the part that matters most: it makes "everything the public site
 * may see" a query rather than a list someone has to keep correct.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  /** Never leaves the server. See getPublicSettings(). */
  secret: integer('secret', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  /** Per setting, so you can see which one changed and when. */
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Every public URL the site owns, and what renders at it.
 *
 * This is a routing and identity table, not a content store. It holds what all
 * pages have in common — the slug, which renderer to dispatch to, whether it's
 * live, and the metadata scrapers read. The content itself lives in whatever
 * table suits its type: a release in `releases`, a shop's items in `products`,
 * a custom page's composition in `blocks`.
 *
 * One table owning the slug is what makes flat URLs safe. `/i-will-be-me` reads
 * better on a poster than `/r/i-will-be-me`, but only works if something can
 * refuse a slug that collides with `/admin` or `/go` at creation time rather
 * than leaving it to be discovered as a routing bug. See RESERVED_SLUGS.
 */
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // 'home', 'i-will-be-me', 'shop'
  title: text('title').notNull(),
  type: text('type').$type<PageType>().notNull().default('custom'),
  description: text('description'), // meta description + og:description
  /**
   * og:image. A plain path rather than a media reference: scrapers cache this
   * hard and only re-scrape on request, so once a link is in circulation the
   * URL behind it is effectively frozen in every cache that saw it. A static
   * asset restored by the deploy survives a lost volume; a generated file on
   * one does not.
   */
  shareImageUrl: text('share_image_url'),
  published: integer('published', { mode: 'boolean' }).default(true),
  position: integer('position').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * `landing` is the artist page at `/` — exactly one exists and it can't be
 * deleted. The rest are addressed by slug.
 */
export type PageType = 'landing' | 'release' | 'shop' | 'custom';

// Blocks - modular, reorderable page sections
export const blocks = sqliteTable(
  'blocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pageId: integer('page_id'), // FK to pages table (null = home page for backwards compat)
    type: text('type').notNull(), // 'profile', 'links', 'tour_dates', 'image', 'gallery'
    label: text('label'), // user-facing label: 'Social Media', 'Tour 2026'
    config: text('config', { mode: 'json' }).$type<BlockConfig>(),
    position: integer('position').default(0),
    visible: integer('visible', { mode: 'boolean' }).default(true),
    collapsed: integer('collapsed', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [index('blocks_page_id_idx').on(table.pageId)]
);

/**
 * A music release. Its URL, SEO and published state live on its `pages` row;
 * this table holds only what's specific to a piece of recorded music.
 *
 * `releaseDate` is the single source of truth for when the record is out. The
 * page derives its own state from it (pre-release → out) rather than storing a
 * status that a scheduled job has to flip: a date that moves then only moves in
 * one place, and there's no window where a column and the calendar disagree
 * because a job didn't fire.
 */
export const releases = sqliteTable('releases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pageId: integer('page_id').notNull().unique(), // FK to pages
  title: text('title').notNull(), // the work's title, distinct from the page's
  releaseDate: integer('release_date', { mode: 'timestamp' }).notNull(),
  coverUrl: text('cover_url'), // what MediaPicker returns; may be a crop with no media row
  presaveUrl: text('presave_url'), // outbound handoff while native pre-save is blocked
  isrc: text('isrc'), // needed for YouTube Content ID; stable across services
  upc: text('upc'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

// Links with categories
export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * A link belongs to exactly one owner: a block on a page, or a release.
     * Both are nullable because only one is ever set. Reusing this table rather
     * than giving releases their own means /go, linkClicks and LinkCard all
     * work on release links with no changes.
     */
    blockId: integer('block_id'), // FK to blocks table
    releaseId: integer('release_id'), // FK to releases table
    category: text('category').notNull(), // 'streaming', 'social', 'merch', 'other'
    platform: text('platform').notNull(), // 'spotify', 'instagram', etc.
    url: text('url').notNull(),
    label: text('label'),
    thumbnailUrl: text('thumbnail_url'), // Auto-fetched from YouTube, etc.
    embedData: text('embed_data', { mode: 'json' }).$type<EmbedData>(), // Embed info for supported platforms
    position: integer('position').default(0),
    visible: integer('visible', { mode: 'boolean' }).default(true)
  },
  (table) => [
    index('links_block_id_idx').on(table.blockId),
    index('links_release_id_idx').on(table.releaseId)
  ]
);

// Tour dates
export const tourDates = sqliteTable(
  'tour_dates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blockId: integer('block_id').notNull(), // FK to blocks table
    date: text('date').notNull(),
    time: text('time'), // Show time (e.g., "20:00")
    title: text('title'), // Event/show title
    venue: text('venue', { mode: 'json' }).$type<Venue>().notNull(),
    lineup: text('lineup'), // Other acts (free-form text)
    ticketUrl: text('ticket_url'),
    eventUrl: text('event_url'), // Link to event page (Facebook, Bandsintown, etc.)
    soldOut: integer('sold_out', { mode: 'boolean' }).default(false),
    position: integer('position').default(0)
  },
  (table) => [
    index('tour_dates_block_id_idx').on(table.blockId),
    index('tour_dates_date_idx').on(table.date)
  ]
);

// Media library
export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  url: text('url').notNull(), // Optimized version for web display (video: the source file)
  originalUrl: text('original_url'), // Original file (for press kit downloads)
  thumbnailUrl: text('thumbnail_url'), // Smaller version for grids/previews (video: poster frame)
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  size: integer('size'), // bytes (of optimized version)
  originalSize: integer('original_size'), // bytes (of original)
  durationMs: integer('duration_ms'), // video only; null for images
  /**
   * What this file is for. Set at write time rather than inferred, because a
   * mime type can't tell raw footage apart from a finished render — both are
   * video/mp4, but only one belongs in a clip's source list.
   */
  role: text('role').$type<MediaRole>().notNull().default('asset'),
  alt: text('alt'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

export type MediaRole = 'asset' | 'source' | 'music' | 'render' | 'document';

/** Default role for a freshly uploaded file, before anything overrides it. */
export function roleForMime(mimeType: string): MediaRole {
  if (mimeType.startsWith('video/')) return 'source';
  if (mimeType.startsWith('audio/')) return 'music';
  // Everything non-media: bios, riders, one-sheets.
  if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) return 'document';
  return 'asset';
}

/** True when a media row is a video rather than an image. */
export function isVideo(item: { mimeType: string }): boolean {
  return item.mimeType.startsWith('video/');
}

/** True when a media row is an audio file (used as a clip's music bed). */
export function isAudio(item: { mimeType: string }): boolean {
  return item.mimeType.startsWith('audio/');
}

// ============================================================================
// Clip Studio — assemble source clips into a branded, post-ready social video
// ============================================================================

/**
 * Shared tag vocabulary.
 *
 * One table for every kind of content rather than a `tags` column per table, so
 * a tag means the same thing on a clip as it does on a piece of footage, and
 * renaming it renames it everywhere. `slug` is the identity — it is what stops
 * "Indie Rock" and "indie rock" becoming two tags — while `name` keeps whatever
 * casing was typed first for display.
 */
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/** What a tag is attached to. Add a kind here when a new table becomes taggable. */
export type TaggableType = 'clip' | 'media';

/**
 * Tag-to-content join.
 *
 * Polymorphic rather than one join table per content type: the point of a shared
 * vocabulary is asking "what is tagged X" across kinds in a single query. SQLite
 * has no cross-table foreign keys for this shape, so deletes are cleaned up by
 * the callers in tags.ts.
 */
export const taggings = sqliteTable(
  'taggings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tagId: integer('tag_id').notNull(),
    entityType: text('entity_type').$type<TaggableType>().notNull(),
    entityId: integer('entity_id').notNull()
  },
  (table) => [
    uniqueIndex('taggings_unique_idx').on(table.tagId, table.entityType, table.entityId),
    index('taggings_entity_idx').on(table.entityType, table.entityId)
  ]
);

/**
 * Where a published clip actually landed, one row per platform.
 *
 * Written by the publishing workflow calling back after it posts, not by
 * Artistack — it never holds a platform credential. Without this, "published"
 * only ever meant "the webhook returned 200", and nothing here could answer
 * where a clip went or whether a platform rejected it.
 *
 * `platform` is free text rather than an enum so a new target can be reported
 * without a migration.
 */
export const clipPosts = sqliteTable(
  'clip_posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').notNull(),
    platform: text('platform').notNull(),
    /** `draft` covers platforms that only accept an upload you then post by hand. */
    status: text('status').$type<'live' | 'failed' | 'draft'>().notNull(),
    /** Public URL of the post, when the platform gives one back. */
    url: text('url'),
    error: text('error'),
    postedAt: integer('posted_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [
    // One row per platform per clip; a retry updates rather than accumulates.
    uniqueIndex('clip_posts_unique_idx').on(table.projectId, table.platform),
    index('clip_posts_project_idx').on(table.projectId)
  ]
);

// A clip project: the render recipe. Sources live in clipSources, and each
// render attempt is a row in renderJobs, so a project keeps its history.
export const clipProjects = sqliteTable('clip_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // the clip's title, and what the post sheet posts under
  description: text('description'), // post body (the sidecar's markdown body)
  config: text('config', { mode: 'json' }).$type<ClipRenderConfig>(),
  captions: text('captions', { mode: 'json' }).$type<TimedCaption[]>().default([]),
  outputMediaId: integer('output_media_id'), // FK to media, set once a render succeeds
  /**
   * The graphic the last render actually used. Written by the renderer, so a
   * randomised pick is visible after the fact rather than a guess.
   */
  resolvedGraphicMediaId: integer('resolved_graphic_media_id'),

  // --- Review and release ---
  status: text('status').$type<ClipStatus>().notNull().default('draft'),
  /**
   * Unguessable token for the public preview page. Generated on first share, so
   * a clip that's never been sent out has no reachable URL at all.
   */
  previewToken: text('preview_token').unique(),
  /**
   * When the preview link stops working. Set on every send-for-review, so a
   * clip that goes round again gets a fresh window rather than a dead link.
   */
  previewExpiresAt: integer('preview_expires_at', { mode: 'timestamp' }),
  /** Set when a coverage alert fired, so it fires once per clip. */
  publishAlertSentAt: integer('publish_alert_sent_at', { mode: 'timestamp' }),
  /** Set when the release has been announced, so it's announced exactly once. */
  announcedAt: integer('announced_at', { mode: 'timestamp' }),
  /** Pins this clip to a date instead of letting the drip cadence decide. */
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }),
  reviewNote: text('review_note'), // why it was rejected, or a note on approval
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),

  /** Position in the drip-release order; null means unqueued. */
  queuePosition: integer('queue_position'),
  /** Days to wait after this clip before releasing the next. Null uses the default cadence. */
  queueGapDays: integer('queue_gap_days'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

/**
 * Short-lived upload sessions for the phone-upload QR flow.
 *
 * Footage almost always lives on a phone, and getting it onto the machine
 * running the admin is the slowest step in the whole pipeline. Rather than
 * asking someone to log in on a phone, an admin generates a QR that carries a
 * capability token: it can upload, and nothing else. It expires, it's
 * revocable, and it never exposes the library.
 */
export const uploadSessions = sqliteTable(
  'upload_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull().unique(),
    label: text('label'), // what it's for, shown on the phone
    /** When set, uploaded video is added straight to this clip project's sources. */
    projectId: integer('project_id'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    uploadCount: integer('upload_count').notNull().default(0),
    revoked: integer('revoked', { mode: 'boolean' }).default(false),
    lastUploadAt: integer('last_upload_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [index('upload_sessions_token_idx').on(table.token)]
);

export type UploadSession = typeof uploadSessions.$inferSelect;

// Source clips for a project, in render order.
export const clipSources = sqliteTable(
  'clip_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').notNull(),
    mediaId: integer('media_id').notNull(),
    position: integer('position').default(0),
    // Trim window in seconds; null means use the whole clip.
    trimStart: integer('trim_start'),
    trimEnd: integer('trim_end'),
    // Silence this clip's own audio — lets a music bed play full over b-roll
    // instead of being ducked by room noise.
    muted: integer('muted', { mode: 'boolean' }).default(false),
    // null inherits the project's watermark setting.
    watermark: integer('watermark', { mode: 'boolean' })
  },
  (table) => [index('clip_sources_project_id_idx').on(table.projectId)]
);

// One render attempt. Rows are kept after completion so failures stay
// inspectable — the ffmpeg log is the only way to diagnose a bad filter graph.
export const renderJobs = sqliteTable(
  'render_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').notNull(),
    status: text('status').notNull().default('queued'), // 'queued' | 'rendering' | 'done' | 'failed' | 'cancelled'
    progress: integer('progress').default(0), // 0-100
    error: text('error'),
    log: text('log'), // tail of ffmpeg stderr, for debugging a failed render
    mediaId: integer('media_id'), // FK to media, on success
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [
    index('render_jobs_project_id_idx').on(table.projectId),
    index('render_jobs_status_idx').on(table.status)
  ]
);

export type ClipProject = typeof clipProjects.$inferSelect;
export type NewClipProject = typeof clipProjects.$inferInsert;
export type ClipSource = typeof clipSources.$inferSelect;
export type NewClipSource = typeof clipSources.$inferInsert;
export type RenderJob = typeof renderJobs.$inferSelect;
export type NewRenderJob = typeof renderJobs.$inferInsert;

// Page view tracking (GDPR compliant - no personal data)
export const pageViews = sqliteTable(
  'page_views',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    path: text('path').notNull(), // e.g., '/', '/links'
    referrer: text('referrer'), // e.g., 'google.com', 'instagram.com', 'direct'
    country: text('country'), // 2-letter country code from IP
    userAgent: text('user_agent'), // Browser/device info
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [
    index('page_views_created_at_idx').on(table.createdAt),
    index('page_views_path_idx').on(table.path)
  ]
);

// Link click tracking
export const linkClicks = sqliteTable(
  'link_clicks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    linkId: integer('link_id').notNull(), // FK to links table
    referrer: text('referrer'),
    country: text('country'),
    /**
     * 'mobile' | 'tablet' | 'desktop', not the raw user agent. Enough to decide
     * whether a destination wants an app deep link or a web URL, without
     * keeping a string that identifies a browser.
     */
    device: text('device'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [
    index('link_clicks_link_id_idx').on(table.linkId),
    index('link_clicks_created_at_idx').on(table.createdAt)
  ]
);

/**
 * The fan email list.
 *
 * Worth owning rather than leaving to a pre-save service: a hosted pre-save
 * collects the address and then charges to let you have it back. Capturing it
 * on your own page first means the list stays yours whatever the pre-save runs
 * on — which is the whole reason this sits on the critical path.
 */
export const subscribers = sqliteTable(
  'subscribers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    name: text('name'),
    /**
     * The page they signed up from, held as a slug rather than a foreign key so
     * it still says something after that page is deleted or renamed.
     */
    source: text('source'),
    country: text('country'),
    /** Evidenced, not assumed: consent has to be demonstrable after the fact. */
    consentAt: integer('consent_at', { mode: 'timestamp' }).notNull(),
    /**
     * One-click unsubscribe. A mailing has to be able to honour it without
     * asking someone to log in to a site they only ever gave an address to.
     */
    token: text('token').notNull().unique(),
    unsubscribedAt: integer('unsubscribed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [index('subscribers_created_at_idx').on(table.createdAt)]
);

// Products - simple shop items (merch, music, etc.)
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price'), // cents/øre (null = "contact for price")
  currency: text('currency').default('NOK'),
  mediaId: integer('media_id'), // product image (FK to media)
  externalUrl: text('external_url'), // link to Bandcamp, Shopify, BigCartel, etc.
  category: text('category'), // simple text: 'merch', 'music', 'digital'
  visible: integer('visible', { mode: 'boolean' }).default(true),
  featured: integer('featured', { mode: 'boolean' }).default(false),
  position: integer('position').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

// Integrations config
/**
 * Cached responses from services we poll — follower counts, recent videos.
 *
 * Only a cache. Credentials and enable flags for those services are columns on
 * `settings`, with everything else that configures a built-in feature. This
 * table used to hold both, which is how an API key ended up living in two
 * places at once.
 */
export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().unique(), // 'spotify', 'youtube'
  lastSync: integer('last_sync', { mode: 'timestamp' }),
  cachedData: text('cached_data', { mode: 'json' })
});

// Venue type for tour dates
export interface Venue {
  name: string;
  city: string;
  address?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

// Block config types
export interface BaseBlockConfig {
  marginTop?: 'none' | 'small' | 'medium' | 'large'; // Default: 'none'
  marginBottom?: 'none' | 'small' | 'medium' | 'large'; // Default: 'medium'
}

export interface ProfileBlockConfig extends BaseBlockConfig {
  showName?: boolean; // default true
  showBio?: boolean; // default true
}

export interface ImageBlockConfig extends BaseBlockConfig {
  mediaId?: number; // Reference to media library
  imageUrl?: string; // Cropped image URL (from MediaPicker)
  shape?: 'circle' | 'rounded' | 'square'; // Default: 'rounded'
  alignment?: 'left' | 'center' | 'right'; // Default: 'center'
  size?: 'mini' | 'small' | 'medium' | 'large' | 'full'; // Default: 'medium'
  showGlow?: boolean; // Accent color glow effect
}

/**
 * Sign-up for the fan list, as a block.
 *
 * The release page has its own; this is for everywhere else — the artist page
 * is where most people actually land, so a list that only grows from release
 * pages grows in bursts and then stops.
 */
export interface EmailBlockConfig extends BaseBlockConfig {
  heading?: string;
  blurb?: string;
}

export interface LinksBlockConfig extends BaseBlockConfig {
  heading?: string;
  displayAs?: 'rows' | 'grid';
  gridColumns?: number; // 2-6, default 3
  stackOnMobile?: boolean; // default true
}

export interface TourDatesBlockConfig extends BaseBlockConfig {
  showPastShows?: boolean; // default true
  heading?: string;
}

export interface GalleryBlockConfig extends BaseBlockConfig {
  mediaIds?: number[];
  displayAs?: 'grid' | 'carousel' | 'bento'; // default 'grid'
  heading?: string;
}

export interface ProductsBlockConfig extends BaseBlockConfig {
  displayAs?: 'grid' | 'list' | 'featured'; // default 'grid'
  category?: string; // filter by category
  limit?: number; // max products to show
  showPrice?: boolean; // default true
  heading?: string;
}

export type BlockConfig =
  | EmailBlockConfig
  | ProfileBlockConfig
  | LinksBlockConfig
  | TourDatesBlockConfig
  | GalleryBlockConfig
  | ImageBlockConfig
  | ProductsBlockConfig;

// Types
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type SettingRow = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
/**
 * The subset of settings safe to hand to the public site.
 *
 * Everything a layout load returns is serialised into the page for the client,
 * and the full row carries the SMTP password, the publish webhook secret and
 * the Google API key. Public components type their prop as this so a widened
 * query can't quietly start shipping them again.
 */

/**
 * Kept as an alias so public components keep a name that says what it is.
 * `settings` holds no credentials now, so the whole row is public-safe.
 */
/*
 * Settings types come from server/settings, where the shapes are declared as
 * valibot schemas. Re-exported here so the many `import type { Settings } from
 * '$lib/server/schema'` call sites didn't all have to move when storage
 * changed. Type-only, so there's no runtime cycle.
 */
export type {
  Settings,
  PublicSettings,
  SiteSettings,
  ThemeSettings,
  FeatureSettings,
  MailSettings,
  DiscordSettings,
  ClipSettings,
  ClipPublishingSettings,
  GoogleSettings,
  SpotifySettings,
  MetaSettings,
  TiktokSettings
} from './settings';

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Release = typeof releases.$inferSelect;
export type NewRelease = typeof releases.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type TourDate = typeof tourDates.$inferSelect;
export type NewTourDate = typeof tourDates.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;
export type LinkClick = typeof linkClicks.$inferSelect;
export type NewLinkClick = typeof linkClicks.$inferInsert;

// Bandcamp embed options
export interface BandcampEmbedData {
  platform: 'bandcamp';
  id: string;
  type: 'album' | 'track';
  enabled?: boolean; // Show as embed or link card
  size?: 'small' | 'large';
  bgColor?: string | null;
  linkColor?: string | null;
  tracklist?: boolean;
  artwork?: 'small' | 'large' | 'none';
}

// Spotify embed options
export interface SpotifyEmbedData {
  platform: 'spotify';
  id: string;
  type: 'track' | 'album' | 'playlist' | 'artist';
  enabled?: boolean;
  theme?: 'dark' | 'light'; // 0 = dark, 1 = light
  compact?: boolean; // Compact view (152px vs 352px)
}

// YouTube embed options
export interface YouTubeEmbedData {
  platform: 'youtube';
  id: string; // Video ID
  enabled?: boolean;
}

// Code forge embed options (GitHub, GitLab, Codeberg)
export interface RepoEmbedData {
  platform: 'github' | 'gitlab' | 'codeberg';
  id: string; // "owner/repo"
  enabled?: boolean;
  showAvatar?: boolean; // default true
  descriptionDisplay?: 'truncate' | 'full'; // default 'truncate'
  description?: string | null;
  language?: string | null;
  stars?: number;
  forks?: number;
  topics?: string[];
  avatarUrl?: string;
}

// Union type for all embed data
export type EmbedData = BandcampEmbedData | SpotifyEmbedData | YouTubeEmbedData | RepoEmbedData;

// Facebook Events types
export interface FacebookConfig {
  pageId: string;
  accessToken: string;
}

export interface FacebookEvent {
  id: string;
  name: string;
  startTime: string;
  endTime?: string;
  place?: {
    name: string;
    location?: {
      city: string;
      country: string;
    };
  };
  ticketUri?: string;
}
