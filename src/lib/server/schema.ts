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
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Site
  siteTitle: text('site_title'), // Overrides name for browser title, falls back to name if empty
  setupCompleted: integer('setup_completed', { mode: 'boolean' }).default(false),
  pressKitEnabled: integer('press_kit_enabled', { mode: 'boolean' }).default(false),
  /**
   * The clip studio as a whole. Distinct from publishEnabled below, which only
   * governs the scheduled outbound release — you want to render and review
   * clips long before any of them are wired up to go out.
   */
  clipsEnabled: integer('clips_enabled', { mode: 'boolean' }).default(false),
  pressKitMediaIds: text('press_kit_media_ids', { mode: 'json' }).$type<number[]>().default([]),
  layout: text('layout').default('default'),
  locale: text('locale').default('nb-NO'),
  // Theme colors
  colorBg: text('color_bg').default('#0c0a14'),
  colorCard: text('color_card').default('#14101f'),
  colorAccent: text('color_accent').default('#8b5cf6'),
  colorText: text('color_text').default('#f4f4f5'),
  colorTextMuted: text('color_text_muted').default('#a1a1aa'),
  colorIcon: text('color_icon').default('#a1a1aa'),
  // UI options
  showShareButton: integer('show_share_button', { mode: 'boolean' }).default(true),
  showPressKit: integer('show_press_kit', { mode: 'boolean' }).default(false),
  // Favicon & PWA
  faviconUrl: text('favicon_url'), // Source image from media library
  faviconGenerated: integer('favicon_generated', { mode: 'boolean' }).default(false),
  // API Keys
  googlePlacesApiKey: text('google_places_api_key'),
  // SMTP Configuration
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port').default(587),
  smtpUser: text('smtp_user'),
  smtpPassword: text('smtp_password'),
  smtpFromAddress: text('smtp_from_address'),
  smtpFromName: text('smtp_from_name'),
  smtpTls: integer('smtp_tls', { mode: 'boolean' }).default(true),
  // Clip publishing — an outbound webhook fired when a queued clip comes due.
  // Deliberately generic rather than platform-specific: whatever consumes it
  // (n8n today) owns the platform credentials and app review, which is the part
  // that doesn't get cheaper by moving it in here.
  publishWebhookUrl: text('publish_webhook_url'),
  publishEnabled: integer('publish_enabled', { mode: 'boolean' }).default(false),
  /** Days between releases when a clip doesn't set its own gap. */
  publishIntervalDays: integer('publish_interval_days').default(3),
  /** Hour of day (0-23) a due clip is released. */
  publishHour: integer('publish_hour').default(10),
  publishLastSent: integer('publish_last_sent', { mode: 'timestamp' }),
  /** Optional shared secret, sent as X-Artistack-Signature. */
  publishSecret: text('publish_secret'),
  /**
   * Images designated as clip graphics — logos and marks a clip can be dressed
   * with. Same shape as pressKitMediaIds: a set of pointers into the library
   * rather than a table, so a file stays an ordinary image and can be both.
   */
  clipGraphicsMediaIds: text('clip_graphics_media_ids', { mode: 'json' })
    .$type<number[]>()
    .default([]),
  /** Used by clips that don't pick one of their own. */
  defaultClipGraphicMediaId: integer('default_clip_graphic_media_id'),
  /**
   * Boilerplate a new clip starts with, saved from whichever clip you last got
   * right. Most posts share their hashtags and their call to action, and typing
   * them again per clip is the kind of copying a default exists to stop.
   */
  clipDefaultTagIds: text('clip_default_tag_ids', { mode: 'json' }).$type<number[]>().default([]),
  clipDefaultDescription: text('clip_default_description'),

  // Discord Integration
  discordWebhookUrl: text('discord_webhook_url'),
  discordEnabled: integer('discord_enabled', { mode: 'boolean' }).default(false),
  /**
   * Clip channels, separate from the stats webhook above because they serve
   * different audiences: a review needs someone to act on it today, a release
   * announcement is for everyone, and stats are a monthly skim.
   */
  clipReviewWebhookUrl: text('discord_clips_webhook_url'),
  clipPublishedWebhookUrl: text('clip_published_webhook_url'),
  discordSchedule: text('discord_schedule').default('weekly'), // 'daily', 'weekly', 'monthly'
  discordScheduleDay: integer('discord_schedule_day').default(1), // 0-6 for weekly (Monday=1), 1-31 for monthly
  discordScheduleTime: text('discord_schedule_time').default('09:00'), // HH:MM
  discordLastSent: integer('discord_last_sent', { mode: 'timestamp' })
});

// Pages - support for multiple pages (home, shop, about, etc.)
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // 'home', 'shop', 'about'
  title: text('title').notNull(),
  type: text('type').notNull().default('custom'), // 'landing', 'shop', 'custom'
  description: text('description'), // SEO description
  published: integer('published', { mode: 'boolean' }).default(true),
  position: integer('position').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

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

// Links with categories
export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blockId: integer('block_id').notNull(), // FK to blocks table
    category: text('category').notNull(), // 'streaming', 'social', 'merch', 'other'
    platform: text('platform').notNull(), // 'spotify', 'instagram', etc.
    url: text('url').notNull(),
    label: text('label'),
    thumbnailUrl: text('thumbnail_url'), // Auto-fetched from YouTube, etc.
    embedData: text('embed_data', { mode: 'json' }).$type<EmbedData>(), // Embed info for supported platforms
    position: integer('position').default(0),
    visible: integer('visible', { mode: 'boolean' }).default(true)
  },
  (table) => [index('links_block_id_idx').on(table.blockId)]
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

export type MediaRole = 'asset' | 'source' | 'music' | 'render';

/** Default role for a freshly uploaded file, before anything overrides it. */
export function roleForMime(mimeType: string): MediaRole {
  if (mimeType.startsWith('video/')) return 'source';
  if (mimeType.startsWith('audio/')) return 'music';
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
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
  },
  (table) => [
    index('link_clicks_link_id_idx').on(table.linkId),
    index('link_clicks_created_at_idx').on(table.createdAt)
  ]
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
export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().unique(), // 'spotify', 'facebook', 'youtube'
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
  config: text('config', { mode: 'json' }), // Store API keys, artist IDs, etc.
  lastSync: integer('last_sync', { mode: 'timestamp' }),
  cachedData: text('cached_data', { mode: 'json' }) // Cache fetched data
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
  | ProfileBlockConfig
  | LinksBlockConfig
  | TourDatesBlockConfig
  | GalleryBlockConfig
  | ImageBlockConfig
  | ProductsBlockConfig;

// Types
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
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
