import { metaText } from './text';

/**
 * Structured data: telling search engines outright what a page is about.
 *
 * A band called something common shares its name with books, films and other
 * bands, and a search engine has to guess which one a page means. JSON-LD says
 * it plainly — this is a music group, these are its official profiles — and
 * the profiles in `sameAs` are what tie the site, the stores and the socials
 * together into one thing it can recognise.
 *
 * Built from what the site already has, so it's right without being set up.
 */

type Json = Record<string, unknown>;

/** Who the site is about, as Settings → Identity describes it. Every field optional, so it works unset. */
export interface IdentityFacts {
  type?: 'group' | 'solo' | 'other';
  genres?: string[];
  hometown?: string | null;
  formed?: string | null;
  members?: Array<{
    name: string;
    role: string | null;
    from: string | null;
    until: string | null;
  }>;
  profiles?: string[];
}

/**
 * A year, or a fuller date, if that's what was written — and nothing if it
 * wasn't. People write "-" or "now" for a member who hasn't left, and a search
 * engine reads an end date of "-" as a date it can't parse, not as "still here".
 */
function asDate(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && /^\d{4}(-\d{2}){0,2}$/.test(text) ? text : null;
}

/**
 * A band is a MusicGroup, and so is one person making music — schema.org says
 * so of its own type. Anyone else is a Person.
 */
function artistType(facts: IdentityFacts | undefined): 'MusicGroup' | 'Person' {
  return facts?.type === 'other' ? 'Person' : 'MusicGroup';
}

/** The band's id, so a release page can point back at the same entity. */
export function artistId(origin: string): string {
  return `${origin}/#artist`;
}

/**
 * Addresses that are the artist's own page on a service, as opposed to one of
 * their tracks, videos or posts. Only these belong in `sameAs`: it asserts
 * "this is also us", and a track is not the band.
 */
const PROFILE_PAGES: RegExp[] = [
  /^open\.spotify\.com\/artist\/[^/]+$/,
  /^music\.apple\.com\/[a-z]{2}\/artist\/[^/]+(\/\d+)?$/,
  /^(www\.)?deezer\.com\/([a-z]{2}\/)?artist\/\d+$/,
  /^(listen\.)?tidal\.com\/(browse\/)?artist\/\d+$/,
  /^music\.youtube\.com\/channel\/[^/]+$/,
  /^(www\.)?youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/,
  /^[a-z0-9-]+\.bandcamp\.com$/,
  /^(www\.)?soundcloud\.com\/[^/]+$/,
  /^(www\.)?instagram\.com\/[^/]+$/,
  /^(www\.)?facebook\.com\/[^/]+$/,
  /^(www\.)?tiktok\.com\/@[^/]+$/,
  /^(www\.)?(x|twitter)\.com\/[^/]+$/,
  /^musicbrainz\.org\/artist\/[0-9a-f-]+$/,
  /^(www\.)?wikidata\.org\/wiki\/Q\d+$/,
  /^[a-z]{2,3}\.wikipedia\.org\/wiki\/[^/]+$/,
  /^urort\.p3\.no\/artist\/[^/]+$/
];

/**
 * The address without its query or trailing slash — a pasted Spotify link
 * carries a page of tracking parameters — or null if it isn't a profile page.
 */
export function profileUrl(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.replace(/\/+$/, '');
    const key = `${hostname.toLowerCase()}${path}`;
    return PROFILE_PAGES.some((pattern) => pattern.test(key)) ? `https://${key}` : null;
  } catch {
    return null;
  }
}

/** The front page: the band itself. */
export function artistData(options: {
  origin: string;
  name: string;
  bio?: string | null;
  links: Array<{ url: string }>;
  facts?: IdentityFacts;
}): Json {
  const facts = options.facts;
  const type = artistType(facts);
  const isMusic = type === 'MusicGroup';

  // Pages listed in Settings are taken as given: someone chose them as official.
  const sameAs = [
    ...new Set([
      ...options.links.map((l) => profileUrl(l.url)).filter((u): u is string => !!u),
      ...(facts?.profiles ?? [])
    ])
  ];

  const place = facts?.hometown ? { '@type': 'Place', name: facts.hometown } : null;

  /*
   * Roles and years go on an OrganizationRole wrapped around the person, which
   * is how schema.org says "was in the band, playing this, from then to then".
   * A plain Person when there's nothing to wrap.
   */
  const members = facts?.type === 'group' ? (facts.members ?? []) : [];
  const member = members.map((m) => {
    const person = { '@type': 'Person', name: m.name };
    const from = asDate(m.from);
    const until = asDate(m.until);
    if (!m.role && !from && !until) return person;
    return {
      '@type': 'OrganizationRole',
      member: person,
      ...(m.role ? { roleName: m.role } : {}),
      ...(from ? { startDate: from } : {}),
      ...(until ? { endDate: until } : {})
    };
  });

  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': artistId(options.origin),
    name: options.name,
    url: `${options.origin}/`,
    ...(metaText(options.bio) ? { description: metaText(options.bio) } : {}),
    ...(isMusic && facts?.genres?.length ? { genre: facts.genres } : {}),
    ...(isMusic && asDate(facts?.formed) ? { foundingDate: asDate(facts?.formed) } : {}),
    ...(place ? (isMusic ? { foundingLocation: place } : { homeLocation: place }) : {}),
    ...(member.length ? { member } : {}),
    ...(sameAs.length ? { sameAs } : {})
  };
}

/**
 * The day a release date means, as YYYY-MM-DD.
 *
 * It's saved as midnight where the editor was, so in UTC the 18th in Oslo is
 * 22:00 on the 17th — and the server's own zone is whatever the host says.
 * Half a day either way lands inside the right day for any zone there is.
 */
function calendarDay(date: Date): string {
  return new Date(date.getTime() + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A release page: the recording, credited to the band on the front page.
 *
 * A recording when there's an ISRC, since that code names one; otherwise the
 * release as an album. `sameAs` here is the release on each store, which is
 * exactly what those links are.
 */
export function releaseData(options: {
  origin: string;
  url: string;
  artist: string;
  title: string;
  releaseDate: Date;
  isrc?: string | null;
  upc?: string | null;
  image?: string | null;
  links: Array<{ url: string }>;
  facts?: IdentityFacts;
}): Json {
  const sameAs = [...new Set(options.links.map((l) => l.url))];
  return {
    '@context': 'https://schema.org',
    '@type': options.isrc ? 'MusicRecording' : 'MusicAlbum',
    name: options.title,
    url: options.url,
    datePublished: calendarDay(options.releaseDate),
    byArtist: {
      '@type': artistType(options.facts),
      '@id': artistId(options.origin),
      name: options.artist,
      url: `${options.origin}/`
    },
    ...(options.isrc ? { isrcCode: options.isrc } : {}),
    ...(options.upc && !options.isrc ? { gtin: options.upc } : {}),
    ...(options.image ? { image: options.image } : {}),
    ...(sameAs.length ? { sameAs } : {})
  };
}

/**
 * The tag itself, for `{@html}` in a head.
 *
 * `<` is escaped so text from the site — a bio, a title — can't close the
 * script early; JSON reads `\u003c` as the same character.
 */
export function jsonLdTag(data: Json): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</` + `script>`;
}
