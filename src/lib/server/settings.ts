import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { settings } from './schema';

/**
 * Settings, one row per key, values as JSON.
 *
 * Types are declared here rather than as columns. SQLite doesn't enforce column
 * types unless a table is STRICT, so typed columns were only ever a
 * compile-time promise; a valibot schema per key is that same promise plus a
 * runtime check, and adding a setting no longer needs a migration.
 *
 * Every key declares whether it holds credentials. That's what makes
 * `getPublicSettings()` safe by construction rather than by remembering — the
 * bug that started this was a public load selecting a whole row and shipping
 * the SMTP password into the HTML of every page.
 */

const site = v.object({
  title: v.nullable(v.string()),
  locale: v.string(),
  layout: v.string(),
  setupCompleted: v.boolean(),
  showShareButton: v.boolean(),
  faviconUrl: v.nullable(v.string()),
  faviconGenerated: v.boolean()
});

const theme = v.object({
  colorBg: v.string(),
  colorCard: v.string(),
  colorAccent: v.string(),
  colorText: v.string(),
  colorTextMuted: v.string(),
  colorIcon: v.string()
});

/**
 * Saved palettes, by name.
 *
 * The live colours stay in `theme`; this is a shelf you can put one on and take
 * it back off. Applying a scheme copies it into the draft like any other
 * appearance edit, so it lands with Update and Undo puts it back.
 */
const colorSchemes = v.object({
  schemes: v.record(v.string(), theme)
});

const features = v.object({
  pressKit: v.boolean(),
  showPressKit: v.boolean(),
  pressKitMediaIds: v.array(v.number()),
  clips: v.boolean(),
  releases: v.boolean(),
  pages: v.boolean(),
  shows: v.boolean(),
  shop: v.boolean(),
  subscribers: v.boolean(),
  pixels: v.boolean()
});

/**
 * Payment credentials.
 *
 * A `secret` subject, which is what keeps it out of `getPublicSettings` — 1.3.0
 * fixed exactly this class of leak, where keys were being serialised into the
 * HTML of every public page. These are worse than an SMTP password: they move
 * money.
 *
 * `testMode` picks the test environment for whichever provider is in use, so a
 * shop can be wired up and tried without charging anyone. PayPal's sandbox
 * needs nothing but a PayPal login, which makes it the one that can be walked
 * end to end before there's a company behind any of this.
 */
const payments = v.object({
  testMode: v.boolean(),
  /**
   * A checkout that takes no money.
   *
   * Separate from `testMode`, which picks a real provider's test environment.
   * This one has no provider behind it at all — it's for walking the shop
   * before there's an account to walk it with.
   */
  testCheckout: v.boolean(),
  vippsClientId: v.nullable(v.string()),
  vippsClientSecret: v.nullable(v.string()),
  vippsSubscriptionKey: v.nullable(v.string()),
  vippsMerchantSerialNumber: v.nullable(v.string()),
  paypalClientId: v.nullable(v.string()),
  paypalClientSecret: v.nullable(v.string())
});

const mail = v.object({
  smtpHost: v.nullable(v.string()),
  smtpPort: v.number(),
  smtpUser: v.nullable(v.string()),
  smtpPassword: v.nullable(v.string()),
  smtpFromAddress: v.nullable(v.string()),
  smtpFromName: v.nullable(v.string()),
  smtpTls: v.boolean()
});

const discord = v.object({
  webhookUrl: v.nullable(v.string()),
  enabled: v.boolean(),
  schedule: v.string(),
  scheduleDay: v.number(),
  scheduleTime: v.string(),
  lastSent: v.nullable(v.number())
});

const clips = v.object({
  graphicsMediaIds: v.array(v.number()),
  defaultGraphicMediaId: v.nullable(v.number()),
  defaultDescription: v.nullable(v.string()),
  defaultTagIds: v.array(v.number()),
  reviewWebhookUrl: v.nullable(v.string())
});

/**
 * Separate from `clips` because it's written on a different rhythm:
 * `publishLastSent` ticks on every release, and bundling it with the graphics
 * list would rewrite that list — and its `updated_at` — each time.
 */
const clipPublishing = v.object({
  publishedWebhookUrl: v.nullable(v.string()),
  publishWebhookUrl: v.nullable(v.string()),
  publishEnabled: v.boolean(),
  publishIntervalDays: v.number(),
  publishHour: v.number(),
  publishLastSent: v.nullable(v.number()),
  publishSecret: v.nullable(v.string())
});

const google = v.object({
  apiKey: v.nullable(v.string()),
  placesEnabled: v.boolean(),
  youtubeEnabled: v.boolean(),
  youtubeChannelId: v.nullable(v.string())
});

/**
 * Its own key because the tokens refresh on their own schedule — a refresh
 * shouldn't rewrite the Google key, or make it look like it changed.
 */
const spotify = v.object({
  clientId: v.nullable(v.string()),
  clientSecret: v.nullable(v.string()),
  artistId: v.nullable(v.string()),
  accessToken: v.nullable(v.string()),
  refreshToken: v.nullable(v.string()),
  tokenExpiry: v.nullable(v.number())
});

const meta = v.object({
  pixelId: v.nullable(v.string()),
  capiToken: v.nullable(v.string())
});

const tiktok = v.object({
  pixelId: v.nullable(v.string())
});

/**
 * The registry. A key's defaults double as its shape, so a fresh install and a
 * half-filled one behave the same — every read returns a complete object.
 */
export const SETTING_KEYS = {
  site: {
    schema: site,
    secret: false,
    defaults: {
      title: null,
      locale: 'nb-NO',
      layout: 'default',
      setupCompleted: false,
      showShareButton: true,
      faviconUrl: null,
      faviconGenerated: false
    }
  },
  theme: {
    schema: theme,
    secret: false,
    defaults: {
      colorBg: '#0c0a14',
      colorCard: '#14101f',
      colorAccent: '#8b5cf6',
      colorText: '#f4f4f5',
      colorTextMuted: '#a1a1aa',
      colorIcon: '#a1a1aa'
    }
  },
  colorSchemes: {
    schema: colorSchemes,
    secret: false,
    defaults: { schemes: {} as Record<string, v.InferOutput<typeof theme>> }
  },
  features: {
    schema: features,
    secret: false,
    defaults: {
      pressKit: false,
      showPressKit: false,
      pressKitMediaIds: [] as number[],
      clips: false,
      releases: false,
      pages: false,
      shows: false,
      shop: false,
      subscribers: false,
      pixels: false
    }
  },
  payments: {
    schema: payments,
    secret: true,
    defaults: {
      testMode: true,
      testCheckout: false,
      vippsClientId: null,
      vippsClientSecret: null,
      vippsSubscriptionKey: null,
      vippsMerchantSerialNumber: null,
      paypalClientId: null,
      paypalClientSecret: null
    }
  },
  mail: {
    schema: mail,
    secret: true,
    defaults: {
      smtpHost: null,
      smtpPort: 587,
      smtpUser: null,
      smtpPassword: null,
      smtpFromAddress: null,
      smtpFromName: null,
      smtpTls: true
    }
  },
  discord: {
    schema: discord,
    secret: true,
    defaults: {
      webhookUrl: null,
      enabled: false,
      schedule: 'weekly',
      scheduleDay: 1,
      scheduleTime: '09:00',
      lastSent: null
    }
  },
  clips: {
    schema: clips,
    secret: true,
    defaults: {
      graphicsMediaIds: [] as number[],
      defaultGraphicMediaId: null,
      defaultDescription: null,
      defaultTagIds: [] as number[],
      reviewWebhookUrl: null
    }
  },
  clipPublishing: {
    schema: clipPublishing,
    secret: true,
    defaults: {
      publishedWebhookUrl: null,
      publishWebhookUrl: null,
      publishEnabled: false,
      publishIntervalDays: 3,
      publishHour: 10,
      publishLastSent: null,
      publishSecret: null
    }
  },
  google: {
    schema: google,
    secret: true,
    defaults: { apiKey: null, placesEnabled: true, youtubeEnabled: true, youtubeChannelId: null }
  },
  spotify: {
    schema: spotify,
    secret: true,
    defaults: {
      clientId: null,
      clientSecret: null,
      artistId: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null
    }
  },
  meta: {
    schema: meta,
    secret: true,
    defaults: { pixelId: null, capiToken: null }
  },
  tiktok: {
    schema: tiktok,
    secret: true,
    defaults: { pixelId: null }
  }
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;
export type SettingValue<K extends SettingKey> = v.InferOutput<(typeof SETTING_KEYS)[K]['schema']>;

export type SiteSettings = SettingValue<'site'>;
export type ThemeSettings = SettingValue<'theme'>;
export type FeatureSettings = SettingValue<'features'>;
export type ColorSchemes = SettingValue<'colorSchemes'>;
export type MailSettings = SettingValue<'mail'>;
export type DiscordSettings = SettingValue<'discord'>;
export type ClipSettings = SettingValue<'clips'>;
export type ClipPublishingSettings = SettingValue<'clipPublishing'>;
export type GoogleSettings = SettingValue<'google'>;
export type SpotifySettings = SettingValue<'spotify'>;
export type MetaSettings = SettingValue<'meta'>;
export type TiktokSettings = SettingValue<'tiktok'>;

/**
 * Read one setting.
 *
 * Stored values are merged over the defaults and then validated, so a key
 * written before a field existed still returns a complete, correct object —
 * which is what replaces a migration when a setting gains a field.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const entry = SETTING_KEYS[key];
  const merged = { ...entry.defaults, ...((row?.value as object) ?? {}) };

  const result = v.safeParse(entry.schema, merged);
  if (result.success) return result.output as SettingValue<K>;

  /*
   * A stored value that doesn't fit its schema is a bug, but not a reason to
   * fail a page render — so fall back to defaults and complain loudly.
   *
   * Loudly matters: `faviconGenerated` once arrived from a migration as `1`
   * rather than `true`, the whole `site` key fell back, and the only visible
   * symptom was the first-run setup card reappearing on a configured site.
   * The field that failed is named here so the next one is a two-second fix.
   */
  const failed = result.issues
    .map((issue) => issue.path?.map((p) => String(p.key)).join('.') ?? '?')
    .join(', ');
  console.warn(
    `[settings] "${key}" failed validation on: ${failed} — using defaults for the whole key. ` +
      `Stored value: ${JSON.stringify(row?.value)}`
  );
  return entry.defaults as unknown as SettingValue<K>;
}

/** Write part of one setting, merged over what's stored. */
export async function setSetting<K extends SettingKey>(
  key: K,
  patch: Partial<SettingValue<K>>
): Promise<void> {
  const current = await getSetting(key);
  const next = v.parse(SETTING_KEYS[key].schema, { ...current, ...patch });
  const now = new Date();

  await db
    .insert(settings)
    .values({
      key,
      value: next,
      secret: SETTING_KEYS[key].secret,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: now } });
}

/**
 * Everything the public site may see.
 *
 * A query over `secret`, not a hand-maintained list of field names: a key added
 * with `secret: true` is excluded without anyone remembering to exclude it.
 */
export async function getPublicSettings(): Promise<{
  site: SiteSettings;
  theme: ThemeSettings;
  features: FeatureSettings;
}> {
  const [siteValue, themeValue, featureValue] = await Promise.all([
    getSetting('site'),
    getSetting('theme'),
    getSetting('features')
  ]);

  return { site: siteValue, theme: themeValue, features: featureValue };
}

/* Named accessors, so call sites read as what they want, not as a string key. */
export const getColorSchemes = () => getSetting('colorSchemes');

/** Snapshot a palette under a name, overwriting a scheme of the same name. */
export async function saveColorScheme(name: string, palette: ThemeSettings): Promise<void> {
  const { schemes } = await getColorSchemes();
  await setSetting('colorSchemes', { schemes: { ...schemes, [name]: palette } });
}

export async function deleteColorScheme(name: string): Promise<void> {
  const { schemes } = await getColorSchemes();
  const next = { ...schemes };
  delete next[name];
  await setSetting('colorSchemes', { schemes: next });
}
export const getMailSettings = () => getSetting('mail');
export const getDiscordSettings = () => getSetting('discord');
export const getClipSettings = () => getSetting('clips');
export const getClipPublishingSettings = () => getSetting('clipPublishing');
export const getGoogleSettings = () => getSetting('google');
export const getSpotifySettings = () => getSetting('spotify');
export const getMetaSettings = () => getSetting('meta');
export const getTiktokSettings = () => getSetting('tiktok');

export const updateDiscordSettings = (patch: Partial<DiscordSettings>) =>
  setSetting('discord', patch);
export const updateClipSettings = (patch: Partial<ClipSettings>) => setSetting('clips', patch);
export const updateClipPublishingSettings = (patch: Partial<ClipPublishingSettings>) =>
  setSetting('clipPublishing', patch);
export const updateGoogleSettings = (patch: Partial<GoogleSettings>) => setSetting('google', patch);
export const updateSpotifySettings = (patch: Partial<SpotifySettings>) =>
  setSetting('spotify', patch);

/**
 * The flat shape the rest of the app already reads.
 *
 * Site, theme and feature flags arrive as one object using the field names call
 * sites have always used, so the storage change stops at this file. `id` is a
 * constant — there is a row per key now, and nothing downstream means anything
 * by it beyond "the settings".
 */
export type Settings = SiteSettings &
  ThemeSettings & {
    id: number;
    siteTitle: string | null;
    pressKitEnabled: boolean;
    showPressKit: boolean;
    pressKitMediaIds: number[];
    clipsEnabled: boolean;
    releasesEnabled: boolean;
    pagesEnabled: boolean;
    showsEnabled: boolean;
    shopEnabled: boolean;
    subscribersEnabled: boolean;
    pixelsEnabled: boolean;
  };

/** The whole row is public-safe now; the alias keeps the name meaningful. */
export type PublicSettings = Settings;

export async function getSettings(): Promise<Settings> {
  const { site: s, theme: t, features: f } = await getPublicSettings();

  return {
    ...s,
    ...t,
    id: 1,
    siteTitle: s.title,
    pressKitEnabled: f.pressKit,
    showPressKit: f.showPressKit,
    pressKitMediaIds: f.pressKitMediaIds,
    clipsEnabled: f.clips,
    releasesEnabled: f.releases,
    pagesEnabled: f.pages,
    showsEnabled: f.shows,
    shopEnabled: f.shop,
    subscribersEnabled: f.subscribers,
    pixelsEnabled: f.pixels
  };
}

/**
 * One entry point for the admin's settings form, which posts a flat object
 * mixing concerns — site title beside SMTP host beside a pixel id.
 *
 * Fields are routed to the key that owns them. Anything unrecognised throws
 * rather than being dropped: this function silently swallowed every SMTP and
 * pixel field for a while, and a save that reports success while writing
 * nothing is the worst way for it to fail.
 */
const FIELD_ROUTES: Record<string, [SettingKey, string]> = {
  // site
  siteTitle: ['site', 'title'],
  title: ['site', 'title'],
  locale: ['site', 'locale'],
  layout: ['site', 'layout'],
  setupCompleted: ['site', 'setupCompleted'],
  showShareButton: ['site', 'showShareButton'],
  faviconUrl: ['site', 'faviconUrl'],
  faviconGenerated: ['site', 'faviconGenerated'],
  // theme
  colorBg: ['theme', 'colorBg'],
  colorCard: ['theme', 'colorCard'],
  colorAccent: ['theme', 'colorAccent'],
  colorText: ['theme', 'colorText'],
  colorTextMuted: ['theme', 'colorTextMuted'],
  colorIcon: ['theme', 'colorIcon'],
  // features
  pressKitEnabled: ['features', 'pressKit'],
  showPressKit: ['features', 'showPressKit'],
  pressKitMediaIds: ['features', 'pressKitMediaIds'],
  clipsEnabled: ['features', 'clips'],
  releasesEnabled: ['features', 'releases'],
  pagesEnabled: ['features', 'pages'],
  showsEnabled: ['features', 'shows'],
  shopEnabled: ['features', 'shop'],
  subscribersEnabled: ['features', 'subscribers'],
  pixelsEnabled: ['features', 'pixels'],
  // mail
  smtpHost: ['mail', 'smtpHost'],
  smtpPort: ['mail', 'smtpPort'],
  smtpUser: ['mail', 'smtpUser'],
  smtpPassword: ['mail', 'smtpPassword'],
  smtpFromAddress: ['mail', 'smtpFromAddress'],
  smtpFromName: ['mail', 'smtpFromName'],
  smtpTls: ['mail', 'smtpTls'],
  // pixels
  metaPixelId: ['meta', 'pixelId'],
  metaCapiToken: ['meta', 'capiToken'],
  tiktokPixelId: ['tiktok', 'pixelId']
};

export async function updateSiteSettings(patch: Record<string, unknown>): Promise<void> {
  const byKey = new Map<SettingKey, Record<string, unknown>>();
  const unknown: string[] = [];

  for (const [field, value] of Object.entries(patch)) {
    const route = FIELD_ROUTES[field];
    if (!route) {
      unknown.push(field);
      continue;
    }
    const [key, target] = route;
    const bucket = byKey.get(key) ?? {};
    bucket[target] = value;
    byKey.set(key, bucket);
  }

  if (unknown.length) {
    throw new Error(
      `updateSiteSettings: no route for ${unknown.join(', ')} — add it to FIELD_ROUTES`
    );
  }

  for (const [key, values] of byKey) {
    await setSetting(key, values as never);
  }
}
