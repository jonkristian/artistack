// Shared bot detection, referrer parsing, IP utilities, and geolocation
// Used by hooks.server.ts (page views), go/[linkId] (link clicks) and
// c/[slug] (clip campaign links)

import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { pageViews } from './schema';
import { visitorToken } from './visitor';

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
  event: RequestEvent,
  path: string,
  userAgent: string,
  hostname: string
): Promise<void> {
  const referrer = parseReferrer(event.request.headers.get('referer'), hostname);
  const ip = getClientIP(event);
  const country = ip ? await lookupCountry(ip) : null;

  await db.insert(pageViews).values({
    path,
    referrer,
    country,
    // The class, not the string it came from. See the column's own note.
    device: deviceFromUserAgent(userAgent),
    visitor: visitorToken(ip, userAgent, hostname)
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

/**
 * Who is asking, as far as the server can honestly tell.
 *
 * This used to read the first value out of whichever of five forwarding headers
 * turned up first. Every one of those is written by the client, so it was a
 * number the caller chose — which is fine for a country column and not fine for
 * the thing keyed on it: a fresh `X-Forwarded-For` per request gave a fresh
 * rate-limit bucket, and the sign-up limit that stops this server sending a
 * stranger's mail was a formality.
 *
 * `getClientAddress()` is the adapter's answer instead. It reads the forwarded
 * chain from the *right* — the end the proxy appended, not the start the caller
 * supplied — using `ADDRESS_HEADER` and `XFF_DEPTH`, which nixpacks.toml sets.
 *
 * Unset, it falls back to the socket address. That is not a hole: behind a proxy
 * the socket address is the proxy, identical for everyone, so the limit holds as
 * a single allowance for the whole site rather than one each. Wrong, and
 * annoying, but wrong in the direction that refuses rather than admits.
 */
export function getClientIP(event: RequestEvent): string | null {
  let address: string;
  try {
    address = event.getClientAddress();
  } catch {
    // adapter-node throws when ADDRESS_HEADER is set and the header is absent —
    // a request that reached the app without going through the proxy.
    return null;
  }

  if (!address || address === '::1' || address === '127.0.0.1') return null;
  return address;
}

// In-memory cache for IP → country lookups (avoids hitting rate limits)
const countryCache = new Map<string, { country: string | null; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
/** Hard ceiling on cached addresses, whatever their age. */
const CACHE_MAX = 10000;

/**
 * An IPv4 or IPv6 address and nothing else.
 *
 * The value goes into an outbound URL, so it is checked for being an address
 * rather than trusted for having come from a header. The host is fixed either
 * way, but a lookup for something that isn't an address is a request worth not
 * making — and this is also what keeps the cache below keyed on a bounded set
 * of shapes rather than on whatever arrives.
 */
const IP_ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]{2,45})$/;

export async function lookupCountry(ip: string): Promise<string | null> {
  if (!IP_ADDRESS.test(ip)) return null;

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

      /*
       * Evict old entries if cache grows too large — and if that clears
       * nothing, drop the oldest anyway. Sweeping only expired entries meant a
       * burst of distinct addresses, none of them yet an hour old, grew the map
       * without limit; a cache with a ceiling has to have one it can always
       * reach. Map iterates in insertion order, so the front is the oldest.
       */
      if (countryCache.size > CACHE_MAX) {
        const now = Date.now();
        for (const [key, val] of countryCache) {
          if (val.expires < now) countryCache.delete(key);
        }
        for (const key of countryCache.keys()) {
          if (countryCache.size <= CACHE_MAX) break;
          countryCache.delete(key);
        }
      }

      return country;
    }
  } catch {
    // Silently fail - analytics shouldn't block requests
  }

  return null;
}
