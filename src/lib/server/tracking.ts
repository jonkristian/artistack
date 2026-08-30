// Shared bot detection, referrer parsing, IP utilities, and geolocation
// Used by hooks.server.ts (page views), go/[linkId] (link clicks) and
// c/[slug] (clip campaign links)

import { db } from './db';
import { pageViews } from './schema';

// Bot detection patterns
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /googlebot/i,
  /bingbot/i,
  /yandex/i,
  /baidu/i,
  /duckduckbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /embedly/i,
  /quora link preview/i,
  /showyoubot/i,
  /outbrain/i,
  /pinterest/i,
  /applebot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /seznambot/i,
  /archive\.org_bot/i,
  /ia_archiver/i,
  /headlesschrome/i,
  /lighthouse/i,
  /pagespeed/i,
  /gtmetrix/i,
  /uptimerobot/i,
  /uptime-kuma/i,
  /pingdom/i,
  /curl\//i,
  /go-http-client/i,
  /python\//i,
  /aiohttp/i,
  /axios/i,
  /node-fetch/i,
  /wget/i,
  /httpie/i,
  /palo alto/i,
  /cortex/i,
  /scaninfo/i,
  /masscan/i,
  /zgrab/i,
  /censys/i,
  /shodan/i,
  /nmap/i,
  /\{USER_AGENT\}/i,
  /air\.ai/i,
  /req\/v\d/i,
  /GoogleOther/i,
  /^Mozilla\/5\.0$/
];

export function isBot(userAgent: string): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Parse referrer into hostname + path (e.g. "github.com/jonkristian/artistack").
 * Self-referrals return 'direct'.
 */
export function parseReferrer(referrer: string | null, currentHost?: string): string {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    const referrerHost = url.hostname.replace(/^www\./, '');

    if (currentHost) {
      const siteHost = currentHost.replace(/^www\./, '');
      if (referrerHost === siteHost) return 'direct';
    }

    // Include path for more useful referrer data (strip trailing slash)
    const path = url.pathname.replace(/\/$/, '');
    return path && path !== '/' ? `${referrerHost}${path}` : referrerHost;
  } catch {
    return 'direct';
  }
}

/**
 * Records a page view, resolving referrer and country.
 *
 * Callers are responsible for bot filtering. The request hook only tracks
 * successful HTML responses, so routes that deliberately redirect — campaign
 * links, for one — have to record their own hit before redirecting, or they'd
 * never appear in stats at all.
 */
export async function recordPageView(
  request: Request,
  path: string,
  userAgent: string,
  hostname: string
): Promise<void> {
  const referrer = parseReferrer(request.headers.get('referer'), hostname);
  const ip = getClientIP(request);
  const country = ip ? await lookupCountry(ip) : null;

  await db.insert(pageViews).values({
    path,
    referrer,
    country,
    userAgent: userAgent.substring(0, 500)
  });
}

/**
 * Coarse device class from a user-agent string.
 *
 * Deliberately not the raw UA, which `page_views` stores: a full UA string is a
 * meaningful fingerprinting surface, and nothing here needs more than "was this
 * a phone". The answer decides whether a destination should be an app deep link
 * or a web URL, and three buckets settle that.
 *
 * Tablet before mobile: an iPad reports "Macintosh" in recent iPadOS but keeps
 * "Mobile" in the token list, and Android tablets say "Android" without it.
 */
export function deviceFromUserAgent(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile|windows phone/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function getClientIP(request: Request): string | null {
  const headers = [
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
    'x-client-ip',
    'true-client-ip'
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      const ip = value.split(',')[0].trim();
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        return ip;
      }
    }
  }

  return null;
}

// In-memory cache for IP → country lookups (avoids hitting rate limits)
const countryCache = new Map<string, { country: string | null; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function lookupCountry(ip: string): Promise<string | null> {
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return null;
  }

  // Check cache
  const cached = countryCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return cached.country;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const country = data.countryCode || null;
      countryCache.set(ip, { country, expires: Date.now() + CACHE_TTL });

      // Evict old entries if cache grows too large
      if (countryCache.size > 10000) {
        const now = Date.now();
        for (const [key, val] of countryCache) {
          if (val.expires < now) countryCache.delete(key);
        }
      }

      return country;
    }
  } catch {
    // Silently fail - analytics shouldn't block requests
  }

  return null;
}
