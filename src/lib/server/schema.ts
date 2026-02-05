import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Artist profile (single row for single-artist setup)
export const profile = sqliteTable('profile', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	bio: text('bio'),
	email: text('email'),
	logoUrl: text('logo_url'),
	logoShape: text('logo_shape').default('circle'), // circle, rounded, square
	photoUrl: text('photo_url'),
	photoShape: text('photo_shape').default('wide-rounded'), // circle, rounded, square, wide, wide-rounded
	backgroundUrl: text('background_url')
});

// Site/app settings (single row singleton)
export const settings = sqliteTable('settings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	// Site
	siteTitle: text('site_title'), // Overrides name for browser title, falls back to name if empty
	layout: text('layout').default('default'),
	locale: text('locale').default('nb-NO'),
	// Theme colors
	colorBg: text('color_bg').default('#0f0f0f'),
	colorCard: text('color_card').default('#1a1a1a'),
	colorAccent: text('color_accent').default('#8b5cf6'),
	colorText: text('color_text').default('#ffffff'),
	colorTextMuted: text('color_text_muted').default('#9ca3af'),
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

// Blocks - modular, reorderable page sections
export const blocks = sqliteTable('blocks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	type: text('type').notNull(), // 'profile', 'links', 'tour_dates', 'images'
	label: text('label'), // user-facing label: 'Social Media', 'Tour 2026'
	config: text('config', { mode: 'json' }).$type<BlockConfig>(),
	position: integer('position').default(0),
	visible: integer('visible', { mode: 'boolean' }).default(true),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});

// Links with categories
export const links = sqliteTable('links', {
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
}, (table) => [
	index('links_block_id_idx').on(table.blockId)
]);

// Tour dates
export const tourDates = sqliteTable('tour_dates', {
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
}, (table) => [
	index('tour_dates_block_id_idx').on(table.blockId),
	index('tour_dates_date_idx').on(table.date)
]);

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
export const pageViews = sqliteTable('page_views', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	path: text('path').notNull(), // e.g., '/', '/links'
	referrer: text('referrer'), // e.g., 'google.com', 'instagram.com', 'direct'
	country: text('country'), // 2-letter country code from IP
	userAgent: text('user_agent'), // Browser/device info
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
}, (table) => [
	index('page_views_created_at_idx').on(table.createdAt),
	index('page_views_path_idx').on(table.path)
]);

// Link click tracking
export const linkClicks = sqliteTable('link_clicks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	linkId: integer('link_id').notNull(), // FK to links table
	referrer: text('referrer'),
	country: text('country'),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
}, (table) => [
	index('link_clicks_link_id_idx').on(table.linkId),
	index('link_clicks_created_at_idx').on(table.createdAt)
]);

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
export interface ProfileBlockConfig {
	showName?: boolean;    // default true
	showLogo?: boolean;    // default true
	showPhoto?: boolean;   // default true
	showBio?: boolean;     // default true
	showEmail?: boolean;   // default false
}

export interface LinksBlockConfig {
	heading?: string;
}

export interface TourDatesBlockConfig {
	showPastShows?: boolean;  // default true
	heading?: string;
}

export interface ImagesBlockConfig {
	mediaIds?: number[];
	displayAs?: 'grid' | 'carousel' | 'download';  // default 'grid'
	heading?: string;
}

export type BlockConfig =
	| ProfileBlockConfig
	| LinksBlockConfig
	| TourDatesBlockConfig
	| ImagesBlockConfig;

// Types
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type TourDate = typeof tourDates.$inferSelect;
export type NewTourDate = typeof tourDates.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
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

// Union type for all embed data
export type EmbedData = BandcampEmbedData | SpotifyEmbedData | YouTubeEmbedData;

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
