import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

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
  // Discord Integration
  discordWebhookUrl: text('discord_webhook_url'),
  discordEnabled: integer('discord_enabled', { mode: 'boolean' }).default(false),
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
  url: text('url').notNull(), // Optimized version for web display
  originalUrl: text('original_url'), // Original file (for press kit downloads)
  thumbnailUrl: text('thumbnail_url'), // Smaller version for grids/previews
  mimeType: text('mime_type').notNull(),
  width: integer('width'),
  height: integer('height'),
  size: integer('size'), // bytes (of optimized version)
  originalSize: integer('original_size'), // bytes (of original)
  alt: text('alt'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

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
