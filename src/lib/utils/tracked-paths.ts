/**
 * Which paths are pages the audience visits.
 *
 * Not under $lib/server because the browser needs it too: the navigation beacon
 * and the ad pixels follow the same rule as the request hook, so a page counts
 * the same way however it was reached, and a pixel never fires where a view
 * wouldn't be counted.
 */

const SKIP_PATHS = [
  '/admin',
  '/api',
  '/login',
  '/logout',
  '/go/', // Link tracking has its own endpoint
  '/preview/', // Internal clip review, not audience traffic
  '/invite/', // Account setup, not audience traffic
  /*
   * Files, not pages. The extension list below catches an image or a font, but
   * not a .zip, .mp4 or .pdf — so a press kit download was landing in the same
   * column as someone reading the front page, and whether a file counted came
   * down to whether its extension happened to be listed.
   */
  '/uploads/',
  '/healthz', // Orchestrator probe, not a visitor
  '/_app',
  '/favicon',
  '/manifest',
  '/robots.txt',
  '/sitemap',
  /*
   * Pages whose address is a secret: a paid download, an unsubscribe link, a
   * phone-upload code. Counting them wrote the token into the stats, and none
   * of them is a visit to the site anyway.
   */
  '/shop/download/',
  '/shop/test-payment',
  '/unsubscribe/',
  '/u/'
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

/**
 * Whether a path is a page the audience visits. Shared by the request hook and
 * the navigation beacon, so a page counts the same however it was reached.
 */
export function isTrackedPath(path: string): boolean {
  if (STATIC_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  return !SKIP_PATHS.some((prefix) => path.startsWith(prefix));
}
