import { db } from './db';
import { releases, links } from './schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { detectPlatformFromUrl, isPlaceholderUrl, platformLabel } from '$lib/utils/platforms';
import { getNextPosition } from './api';
import { getSpotifySettings } from './settings';

/**
 * Finding where a record ended up, from the codes printed on it.
 *
 * A release is delivered to the stores weeks early and appears in all of them
 * at once on the day, each under an address nobody can predict. Until then the
 * ISRC and the UPC are all there is, and afterwards they're enough to find
 * every one of those addresses without typing any of them.
 *
 * The obvious way to do this used to be Odesli, which retired its public API in
 * July 2026 and now answers PUBLIC_API_ACCESS_DEPRECATED. Songwhip's is gone
 * too. Rather than take a dependency on whichever aggregator is next, this asks
 * the stores directly — they all answer questions about their own catalogue for
 * free, and between them they cover what a release page actually links to.
 *
 * Nothing here is required to succeed. Every lookup that fails is a link the
 * artist pastes by hand, which is what they were doing anyway.
 */

export interface ResolvedStoreLink {
  platform: string;
  url: string;
  /** Which lookup produced it, so an odd result can be traced from the log. */
  source: 'deezer' | 'apple' | 'spotify' | 'musicbrainz';
}

export interface StoreLinkQuery {
  isrc?: string | null;
  upc?: string | null;
  /**
   * Spotify's own credentials, when the site has them.
   *
   * Passed in rather than read from settings here, so the resolver stays a
   * function of its arguments and can be pointed at a throwaway app to find out
   * what a given tier is allowed to see.
   */
  spotify?: { clientId: string; clientSecret: string } | null;
  /**
   * Apple storefront, two letters. Apple's URLs are per-country and a fan in
   * Oslo following a /us/ link lands in the wrong shop, so this comes from the
   * site's own locale rather than a default.
   */
  country?: string;
  /** The recording's title, to pick it out of the album it arrived on. */
  title?: string | null;
}

/** Long enough for a slow store, short enough not to hold up a cron tick. */
const TIMEOUT_MS = 10_000;

/**
 * MusicBrainz asks for an identifying User-Agent and throttles to one request a
 * second. Both are easy to honour here: one release is looked up at a time, an
 * hour apart at most.
 */
function musicBrainzAgent(): string {
  const origin = env.BETTER_AUTH_BASE_URL || env.ORIGIN;
  return origin ? `Artistack/1.0 ( ${origin} )` : 'Artistack/1.0';
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1100));
}

/** Nothing is waiting when the first release of a tick comes through. */
let musicBrainzTurn: Promise<unknown> = Promise.resolve();

/**
 * One MusicBrainz request at a time, a second apart.
 *
 * Found by testing rather than by reading the policy: five releases looked up
 * back to back returned everything for the first and nothing for the rest,
 * because the lookups that failed did so the same way a release with no entry
 * does — quietly, with an empty list. A throttle that only bites when several
 * releases land in one tick is cheaper than a bug that looks like missing data.
 */
function throttleMusicBrainz<T>(work: () => Promise<T>): Promise<T> {
  const turn = musicBrainzTurn.then(work);
  // The limit counts requests, not successes, so a failure waits its second too.
  musicBrainzTurn = turn.then(pause, pause);
  return turn;
}

/**
 * A fetch that returns null instead of throwing.
 *
 * Every caller here treats "no answer" and "a bad answer" the same way — as a
 * link that stays empty — so distinguishing a timeout from a 404 would only
 * give each of them a branch that does nothing.
 */
async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Apple appends an affiliate parameter to everything. It isn't ours to pass on. */
function cleanAppleUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('uo');
    parsed.searchParams.delete('app');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** 'nb-NO' is the storefront 'no'. A bare 'en' has no country in it at all. */
export function storefrontFromLocale(locale: string | undefined): string {
  const region = locale?.split(/[-_]/)[1];
  return region ? region.toLowerCase() : 'us';
}

type DeezerTrack = {
  error?: unknown;
  link?: string;
  title?: string;
  album?: { id?: number };
};

/**
 * Deezer, which takes an ISRC directly and answers without a key.
 *
 * Doubly useful: the track it returns names the album it came from, and that
 * album carries the UPC — which is what unlocks Apple, who won't take an ISRC.
 * So this runs first even when the release already has a UPC of its own,
 * because a release delivered as a single may sit on an album with a different
 * one.
 */
async function resolveViaDeezer(
  query: StoreLinkQuery
): Promise<{ links: ResolvedStoreLink[]; upc: string | null; title: string | null }> {
  const found: ResolvedStoreLink[] = [];
  let upc: string | null = null;
  let title: string | null = null;

  if (query.isrc) {
    const track = await fetchJson<DeezerTrack>(
      `https://api.deezer.com/track/isrc:${encodeURIComponent(query.isrc)}`
    );
    // Deezer answers 200 with an error body rather than a status, so the shape
    // is what says whether it found anything.
    if (track && !track.error && track.link) {
      found.push({ platform: 'deezer', url: track.link, source: 'deezer' });
      title = track.title ?? null;

      if (track.album?.id) {
        const album = await fetchJson<{ error?: unknown; upc?: string }>(
          `https://api.deezer.com/album/${track.album.id}`
        );
        if (album && !album.error && album.upc) upc = album.upc;
      }
    }
  }

  // No ISRC, or no match for it: the UPC still identifies the release itself.
  if (!found.length && query.upc) {
    const album = await fetchJson<{ error?: unknown; link?: string; upc?: string }>(
      `https://api.deezer.com/album/upc:${encodeURIComponent(query.upc)}`
    );
    if (album && !album.error && album.link) {
      found.push({ platform: 'deezer', url: album.link, source: 'deezer' });
      upc = album.upc ?? query.upc;
    }
  }

  return { links: found, upc, title };
}

type ITunesResult = {
  wrapperType?: string;
  trackName?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
};

/**
 * Apple, through the iTunes Search API — free, keyless, and exact, but only on
 * a UPC. It rejects ISRCs outright, which is why Deezer runs first.
 *
 * Prefers the track over the album when the title matches one, so a single
 * links to the recording rather than to the sleeve it shares with eleven
 * others.
 */
async function resolveViaApple(
  upc: string,
  country: string,
  title: string | null
): Promise<ResolvedStoreLink[]> {
  const data = await fetchJson<{ results?: ITunesResult[] }>(
    `https://itunes.apple.com/lookup?upc=${encodeURIComponent(upc)}&country=${encodeURIComponent(country)}&entity=song&limit=200`
  );
  if (!data?.results?.length) return [];

  const wanted = title?.trim().toLowerCase();
  const track = wanted
    ? data.results.find((r) => r.trackName?.trim().toLowerCase() === wanted && r.trackViewUrl)
    : undefined;
  if (track?.trackViewUrl) {
    return [{ platform: 'apple_music', url: cleanAppleUrl(track.trackViewUrl), source: 'apple' }];
  }

  const album = data.results.find((r) => r.wrapperType === 'collection' && r.collectionViewUrl);
  if (album?.collectionViewUrl) {
    return [
      { platform: 'apple_music', url: cleanAppleUrl(album.collectionViewUrl), source: 'apple' }
    ];
  }

  return [];
}

/**
 * A client-credentials token, kept until it expires.
 *
 * One token serves every lookup for an hour, and asking for a fresh one per
 * release would be a second round trip for nothing. Keyed by client id so a
 * changed credential doesn't keep using the old app's token.
 */
let spotifyToken: { key: string; token: string; expires: number } | null = null;

export async function spotifyAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  if (spotifyToken && spotifyToken.key === clientId && spotifyToken.expires > Date.now()) {
    return spotifyToken.token;
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    // A minute short of the stated life, so a token can't expire mid-lookup.
    spotifyToken = {
      key: clientId,
      token: data.access_token,
      expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Spotify, which searches on an ISRC — the one thing it still does for a
 * Development Mode app that helps here.
 *
 * The March 2026 cutover took `followers`, `popularity` and top-tracks away
 * from this tier, and Extended Quota needs a registered organisation with 250k
 * monthly listeners, so none of the stats this used to be wanted for are
 * reachable. Search survived, and search is what turns a barcode into an
 * address.
 *
 * Costs a Premium subscription on whoever owns the app — Spotify's requirement,
 * not ours — which is why everything else here works without it.
 */
async function resolveViaSpotify(
  isrc: string,
  credentials: { clientId: string; clientSecret: string },
  country: string
): Promise<ResolvedStoreLink[]> {
  const token = await spotifyAccessToken(credentials.clientId, credentials.clientSecret);
  if (!token) return [];

  const data = await fetchJson<{
    tracks?: { items?: Array<{ external_urls?: { spotify?: string } }> };
  }>(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=1&market=${encodeURIComponent(country.toUpperCase())}`,
    { Authorization: `Bearer ${token}` }
  );

  const url = data?.tracks?.items?.[0]?.external_urls?.spotify;
  return url ? [{ platform: 'spotify', url, source: 'spotify' }] : [];
}

type MusicBrainzIsrc = {
  recordings?: Array<{ relations?: Array<{ url?: { resource?: string } }> }>;
};

/**
 * MusicBrainz, which sometimes hands over everything at once — Spotify and
 * TIDAL included, neither of which will answer a stranger's question about
 * their own catalogue.
 *
 * The catch is coverage: it holds what people have entered, so a well-known
 * record returns four services and a debut single returns nothing. That makes
 * it a bonus rather than a source to rely on. It's also the one worth telling
 * an artist about, because adding a release is a ten-minute job that makes
 * Spotify and TIDAL resolve for free from then on.
 */
async function resolveViaMusicBrainz(isrc: string): Promise<ResolvedStoreLink[]> {
  const ask = () =>
    throttleMusicBrainz(() =>
      fetchJson<MusicBrainzIsrc>(
        `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=url-rels&fmt=json`,
        { 'User-Agent': musicBrainzAgent() }
      )
    );

  /*
   * Asked twice, because it says no in two different tones and only means one
   * of them. A record it has never heard of and a server too busy to look both
   * arrive here as nothing at all, and the second is common enough that three
   * identical lookups in a row returned everything, everything, and nothing.
   * The throttle puts a second between the attempts on its own.
   */
  const data = (await ask()) ?? (await ask());
  if (!data?.recordings?.length) return [];

  const found: ResolvedStoreLink[] = [];
  for (const recording of data.recordings) {
    for (const relation of recording.relations ?? []) {
      const url = relation.url?.resource;
      if (!url) continue;
      // The same detection the admin uses when a link is pasted, so a service
      // is named identically however it arrived.
      const detected = detectPlatformFromUrl(url);
      if (detected?.category === 'streaming') {
        found.push({ platform: detected.platform, url, source: 'musicbrainz' });
      }
    }
  }
  return found;
}

/**
 * Everywhere a recording can be found, from its codes.
 *
 * Direct lookups are listed before MusicBrainz so that when both know a
 * service, the store's own answer wins — it's current, and it's in the right
 * storefront.
 */
export async function resolveStoreLinks(query: StoreLinkQuery): Promise<ResolvedStoreLink[]> {
  if (!query.isrc && !query.upc) return [];

  const country = query.country ?? 'us';
  const deezer = await resolveViaDeezer(query);

  const upc = query.upc ?? deezer.upc;
  const title = query.title ?? deezer.title;

  const [apple, spotify, musicbrainz] = await Promise.all([
    upc ? resolveViaApple(upc, country, title) : Promise.resolve([]),
    query.isrc && query.spotify
      ? resolveViaSpotify(query.isrc, query.spotify, country)
      : Promise.resolve([]),
    query.isrc ? resolveViaMusicBrainz(query.isrc) : Promise.resolve([])
  ]);

  const seen = new Set<string>();
  const ordered: ResolvedStoreLink[] = [];
  for (const link of [...deezer.links, ...apple, ...spotify, ...musicbrainz]) {
    if (seen.has(link.platform)) continue;
    seen.add(link.platform);
    ordered.push(link);
  }
  return ordered;
}

/**
 * Put what was found onto the release.
 *
 * Fills gaps and never overwrites: a real URL already on a service is one
 * somebody chose, and a lookup guessing differently is not a good enough reason
 * to replace it. A placeholder is fair game, because it was never a choice.
 */
export async function fillStoreLinks(releaseId: number, country: string): Promise<number> {
  const [release] = await db
    .select({
      id: releases.id,
      title: releases.title,
      isrc: releases.isrc,
      upc: releases.upc
    })
    .from(releases)
    .where(eq(releases.id, releaseId))
    .limit(1);

  if (!release || (!release.isrc && !release.upc)) return 0;

  // Optional, and absent on most installs: Spotify only answers an app whose
  // owner pays for Premium, so this is the one source a site might not have.
  const spotify = await getSpotifySettings();

  const resolved = await resolveStoreLinks({
    isrc: release.isrc,
    upc: release.upc,
    country,
    title: release.title,
    spotify:
      spotify.clientId && spotify.clientSecret
        ? { clientId: spotify.clientId, clientSecret: spotify.clientSecret }
        : null
  });
  if (!resolved.length) return 0;

  const existing = await db.select().from(links).where(eq(links.releaseId, releaseId));
  let written = 0;

  for (const link of resolved) {
    const match = existing.find((row) => row.platform === link.platform);

    if (match) {
      if (!isPlaceholderUrl(match.url)) continue;
      await db.update(links).set({ url: link.url }).where(eq(links.id, match.id));
      written += 1;
      continue;
    }

    const [created] = await db
      .insert(links)
      .values({
        releaseId,
        blockId: null,
        category: 'streaming',
        platform: link.platform,
        url: link.url,
        label: platformLabel(link.platform),
        position: getNextPosition(existing),
        visible: true
      })
      .returning();
    // Kept in hand so the next insert positions after this one rather than
    // beside it.
    if (created) existing.push(created);
    written += 1;
  }

  if (written) {
    console.log(
      `[store-links] "${release.title}": filled ${written} — ` +
        resolved.map((l) => `${l.platform} (${l.source})`).join(', ')
    );
  }
  return written;
}

/**
 * Releases worth asking the stores about.
 *
 * Mostly this is about records that are out, because that's when the stores
 * start answering. But not only: a release with a pre-order has an address
 * weeks early — Apple serves an unreleased album's page and its track list to
 * anyone who asks with the barcode — and a release page that can already point
 * at it should. Whether one exists isn't knowable from here, so `includeUpcoming`
 * is how the caller says it's worth asking.
 *
 * Pre-orders are rare enough that asking hourly would be a lot of requests to
 * learn the same no, and nothing about them is urgent — one that appears at
 * noon is just as good found the next morning. Release day is the opposite: the
 * stores publish at midnight and the mailing goes at nine, so once a record is
 * out the hourly tick is the point.
 *
 * How long to keep asking afterwards depends on what the release already has,
 * and the two cases are not the same urgency. With nothing usable on it the
 * announcement is held and the release page has nothing to press, so it's worth
 * asking for weeks. With something usable already there, the rest is tidying:
 * stores publish within hours of each other, and a placeholder still sitting
 * there a week later is one none of these sources can answer — YouTube Music,
 * most often, which none of them index.
 *
 * Tidying also covers a service the lookups can answer but haven't yet. Stores
 * don't publish in step, so the first one to answer isn't the last one worth
 * asking about.
 */
const NOTHING_TO_PRESS_DAYS = 42;
const STILL_TIDYING_DAYS = 7;
/** Beyond this a pre-order is vanishingly unlikely to be up yet. */
const PREORDER_LOOKAHEAD_DAYS = 90;

export async function releasesNeedingStoreLinks(
  options: { includeUpcoming?: boolean } = {}
): Promise<number[]> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - NOTHING_TO_PRESS_DAYS * day);
  const tidyCutoff = new Date(now.getTime() - STILL_TIDYING_DAYS * day);
  const horizon = options.includeUpcoming
    ? new Date(now.getTime() + PREORDER_LOOKAHEAD_DAYS * day)
    : now;

  const candidates = await db
    .select({ id: releases.id, isrc: releases.isrc, upc: releases.upc, date: releases.releaseDate })
    .from(releases)
    .where(and(lte(releases.releaseDate, horizon), gte(releases.releaseDate, cutoff)));

  // The services a direct lookup can answer for, so worth waiting on.
  const spotify = await getSpotifySettings();
  const answerable = ['deezer', 'apple_music'];
  if (spotify.clientId && spotify.clientSecret) answerable.push('spotify');

  const needing: number[] = [];
  for (const release of candidates) {
    if (!release.isrc && !release.upc) continue;

    const rows = await db
      .select({ platform: links.platform, url: links.url })
      .from(links)
      .where(eq(links.releaseId, release.id));

    const usable = rows.filter((row) => !isPlaceholderUrl(row.url));
    if (usable.length === 0) {
      needing.push(release.id);
    } else if (release.date > tidyCutoff) {
      const have = new Set(usable.map((row) => row.platform));
      const missing = answerable.some((platform) => !have.has(platform));
      if (missing || rows.length > usable.length) needing.push(release.id);
    }
  }
  return needing;
}
