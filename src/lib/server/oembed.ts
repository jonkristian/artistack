export interface OEmbedData {
  title: string;
  thumbnailUrl: string;
  authorName?: string;
  type?: string;
}

// Request timeout in milliseconds
const FETCH_TIMEOUT = 10000;
// Maximum response size in bytes (1MB)
const MAX_RESPONSE_SIZE = 1024 * 1024;

/**
 * Fetch with timeout and size limit
 */
async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Artistack/1.0',
        ...options.headers
      }
    });

    // Check content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      throw new Error('Response too large');
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Read response text with size limit
 */
async function safeText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_RESPONSE_SIZE) {
        reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('');
}

/**
 * Fetches oEmbed metadata from YouTube/YouTube Music URLs
 * No API key required!
 */
export async function fetchYouTubeMetadata(url: string): Promise<OEmbedData | null> {
  // Convert YouTube Music URLs to regular YouTube URLs
  const normalizedUrl = url
    .replace('music.youtube.com', 'www.youtube.com')
    .replace('youtu.be/', 'www.youtube.com/watch?v=');

  // Check if it's a YouTube URL
  if (!normalizedUrl.includes('youtube.com') && !normalizedUrl.includes('youtu.be')) {
    return null;
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    const response = await safeFetch(oembedUrl);

    if (!response.ok) {
      console.error('YouTube oEmbed failed:', response.status);
      return null;
    }

    const text = await safeText(response);
    const data = JSON.parse(text);

    return {
      title: data.title,
      thumbnailUrl: data.thumbnail_url,
      authorName: data.author_name
    };
  } catch (error) {
    console.error('Failed to fetch YouTube metadata:', error);
    return null;
  }
}

/**
 * Detects if a URL is from YouTube or YouTube Music
 */
export function isYouTubeUrl(url: string): boolean {
  return (
    url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com')
  );
}

/**
 * Extracts video ID from various YouTube URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetches oEmbed metadata from Spotify URLs
 * No API key required!
 */
export async function fetchSpotifyMetadata(url: string): Promise<OEmbedData | null> {
  if (!isSpotifyUrl(url)) {
    return null;
  }

  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await safeFetch(oembedUrl);

    if (!response.ok) {
      console.error('Spotify oEmbed failed:', response.status);
      return null;
    }

    const text = await safeText(response);
    const data = JSON.parse(text);

    // Extract type from URL
    let type = 'track';
    if (url.includes('/album/')) type = 'album';
    else if (url.includes('/playlist/')) type = 'playlist';
    else if (url.includes('/artist/')) type = 'artist';

    return {
      title: data.title,
      thumbnailUrl: data.thumbnail_url,
      type
    };
  } catch (error) {
    console.error('Failed to fetch Spotify metadata:', error);
    return null;
  }
}

/**
 * Detects if a URL is from Spotify
 */
export function isSpotifyUrl(url: string): boolean {
  return url.includes('open.spotify.com/');
}

/**
 * Extracts embed info from Spotify URLs
 * Returns the ID and type (track, album, playlist, artist)
 */
export function extractSpotifyEmbedInfo(
  url: string
): { id: string; type: 'track' | 'album' | 'playlist' | 'artist' } | null {
  // Patterns for different Spotify URL formats:
  // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
  // https://open.spotify.com/album/4iV5W9uYEdYUVa79Axb7Rh
  // https://open.spotify.com/playlist/4iV5W9uYEdYUVa79Axb7Rh
  // https://open.spotify.com/artist/4iV5W9uYEdYUVa79Axb7Rh
  // May include query params like ?si=xxxx
  const pattern = /open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/;
  const match = url.match(pattern);

  if (match) {
    return {
      type: match[1] as 'track' | 'album' | 'playlist' | 'artist',
      id: match[2]
    };
  }

  return null;
}

/**
 * Fetches metadata from Bandcamp URLs by scraping the page
 * The oEmbed API is unreliable, so we extract from meta tags
 */
export async function fetchBandcampMetadata(
  url: string
): Promise<(OEmbedData & { embedId?: string; embedType?: 'album' | 'track' }) | null> {
  if (!isBandcampUrl(url)) {
    return null;
  }

  try {
    // Fetch the page HTML directly
    const response = await safeFetch(url);

    if (!response.ok) {
      console.error('Bandcamp page fetch failed:', response.status);
      return null;
    }

    const html = await safeText(response);

    // Extract embed info from bc-page-properties meta tag
    // Format: {"item_type":"a","item_id":1285143494,...}
    const bcPropsMatch = html.match(/<meta\s+name="bc-page-properties"\s+content="([^"]+)"/);
    let embedId: string | undefined;
    let embedType: 'album' | 'track' | undefined;

    if (bcPropsMatch) {
      try {
        const rawJson = bcPropsMatch[1].replace(/&quot;/g, '"');
        const props = JSON.parse(rawJson);

        // Validate the parsed object has expected structure
        if (
          typeof props === 'object' &&
          props !== null &&
          ('item_id' in props || 'item_type' in props)
        ) {
          // Safely extract and validate item_id
          if ('item_id' in props) {
            const itemId = props.item_id;
            // Ensure it's a number or string that looks like a number
            if (
              typeof itemId === 'number' ||
              (typeof itemId === 'string' && /^\d+$/.test(itemId))
            ) {
              embedId = String(itemId);
            }
          }

          // Safely extract and validate item_type
          if ('item_type' in props && typeof props.item_type === 'string') {
            embedType = props.item_type === 'a' ? 'album' : 'track';
          }
        }
      } catch {
        // Try extracting from og:video URL as fallback
        const ogVideoMatch = html.match(/og:video[^>]+content="[^"]*(?:album|track)=(\d+)/);
        if (ogVideoMatch) {
          embedId = ogVideoMatch[1];
          embedType = html.includes('album=' + ogVideoMatch[1]) ? 'album' : 'track';
        }
      }
    }

    // Extract title from og:title
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : undefined;

    // Extract thumbnail from og:image
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    const thumbnailUrl = imageMatch ? imageMatch[1] : undefined;

    // Extract artist from og:site_name or page content
    const artistMatch = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/);
    const authorName = artistMatch ? artistMatch[1] : undefined;

    if (!title && !thumbnailUrl && !embedId) {
      return null;
    }

    return {
      title: title || 'Bandcamp',
      thumbnailUrl: thumbnailUrl || '',
      authorName,
      embedId,
      embedType
    };
  } catch (error) {
    console.error('Failed to fetch Bandcamp metadata:', error);
    return null;
  }
}

/**
 * Detects if a URL is from Bandcamp
 */
export function isBandcampUrl(url: string): boolean {
  return url.includes('bandcamp.com/');
}

/**
 * Detects if a URL is a GitHub repository URL
 */
export function isGitHubRepoUrl(url: string): boolean {
  return /github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+/i.test(url);
}

/**
 * Extracts owner and repo from a GitHub URL
 */
export function extractGitHubRepoInfo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * Fetches repository metadata from the GitHub public API
 * No auth required — 60 requests/hour per IP
 */
export async function fetchGitHubMetadata(url: string): Promise<{
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  avatarUrl: string;
} | null> {
  const info = extractGitHubRepoInfo(url);
  if (!info) return null;

  try {
    const response = await safeFetch(`https://api.github.com/repos/${info.owner}/${info.repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    });

    if (!response.ok) {
      console.error('GitHub API failed:', response.status);
      return null;
    }

    const text = await safeText(response);
    const data = JSON.parse(text);

    return {
      name: data.name,
      description: data.description ?? null,
      language: data.language ?? null,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      topics: Array.isArray(data.topics) ? data.topics : [],
      avatarUrl: data.owner?.avatar_url ?? ''
    };
  } catch (error) {
    console.error('Failed to fetch GitHub metadata:', error);
    return null;
  }
}

// Re-export detectPlatformFromUrl from shared utility
export { detectPlatformFromUrl } from '$lib/utils/platforms';
