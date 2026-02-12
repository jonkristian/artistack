import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pageViews } from '$lib/server/schema';
import { initScheduler } from '$lib/server/scheduler';
import { isBot, parseReferrer, getClientIP, lookupCountry } from '$lib/server/tracking';

// Initialize scheduled tasks (runs once on server start)
initScheduler();

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

function shouldSkipPath(path: string): boolean {
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return true;
  }
  return SKIP_PATHS.some((prefix) => path.startsWith(prefix));
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
  const country = ip ? await lookupCountry(ip) : null;

  await db.insert(pageViews).values({
    path,
    referrer,
    country,
    userAgent: userAgent.substring(0, 500)
  });
}
