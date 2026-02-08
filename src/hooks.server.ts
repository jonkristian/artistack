import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pageViews } from '$lib/server/schema';
import { initScheduler } from '$lib/server/scheduler';

// Initialize scheduled tasks (runs once on server start)
initScheduler();

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
  /pingdom/i
];

// Paths to skip tracking
const SKIP_PATHS = [
  '/admin',
  '/api',
  '/login',
  '/logout',
  '/go/', // Link tracking has its own endpoint
  '/_app',
  '/favicon',
  '/manifest',
  '/robots.txt',
  '/sitemap'
];

// Static file extensions to skip
const STATIC_EXTENSIONS = [
  '.js',
  '.css',
  '.map',
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.json',
  '.xml'
];

function isBot(userAgent: string): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function shouldSkipPath(path: string): boolean {
  // Skip static files
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return true;
  }
  // Skip specific paths
  return SKIP_PATHS.some((prefix) => path.startsWith(prefix));
}

function parseReferrer(referrer: string | null, currentHost: string): string {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    // Remove www. prefix for consistency
    const referrerHost = url.hostname.replace(/^www\./, '');
    const siteHost = currentHost.replace(/^www\./, '');

    // Filter out self-referrals (internal navigation)
    if (referrerHost === siteHost) {
      return 'direct';
    }

    return referrerHost;
  } catch {
    return 'direct';
  }
}

function getClientIP(request: Request): string | null {
  // Check various headers in order of preference
  const headers = [
    'cf-connecting-ip', // Cloudflare
    'x-real-ip', // Nginx proxy
    'x-forwarded-for', // Standard proxy header
    'x-client-ip', // Apache
    'true-client-ip' // Akamai
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        return ip;
      }
    }
  }

  return null;
}

// Simple country lookup using ip-api.com (free, no API key needed)
// Rate limit: 45 requests/minute, which should be fine for most sites
// Returns null on failure - we don't want to block page loads for analytics
async function lookupCountry(ip: string): Promise<string | null> {
  // Skip local IPs
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000); // 1 second timeout

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return data.countryCode || null;
    }
  } catch {
    // Silently fail - analytics shouldn't block requests
  }

  return null;
}

export const handle: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent') || '';

  // Always resolve the request first for better performance
  const response = await resolve(event);

  // Only track page views for successful HTML responses
  if (response.status !== 200) {
    return response;
  }

  // Skip tracking for bots, admin routes, static files, etc.
  if (shouldSkipPath(path) || isBot(userAgent)) {
    return response;
  }

  // Don't await the tracking - fire and forget for better performance
  trackPageView(request, path, userAgent, url.hostname).catch(() => {
    // Silently ignore tracking errors
  });

  return response;
};

async function trackPageView(
  request: Request,
  path: string,
  userAgent: string,
  hostname: string
): Promise<void> {
  const referrer = parseReferrer(request.headers.get('referer'), hostname);
  const ip = getClientIP(request);

  // Lookup country (with timeout, will be null if it fails)
  const country = ip ? await lookupCountry(ip) : null;

  // Insert page view - no personal data stored (IP is not saved)
  await db.insert(pageViews).values({
    path,
    referrer,
    country,
    userAgent: userAgent.substring(0, 500) // Limit user agent length
  });
}
