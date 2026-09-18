import { db } from './db';
import { pageViews, linkClicks, links, actionClicks, releases, shows } from './schema';
import { sql, eq, gte, lt, and, desc, count, isNotNull } from 'drizzle-orm';

/*
 * `created_at` on both page_views and link_clicks is `mode: 'timestamp'` —
 * seconds, not milliseconds. That matters twice over, and both were wrong:
 *
 *   - `date(created_at, 'unixepoch')` takes seconds. Dividing by 1000 first
 *     dated every link click to January 1970, so the clicks-per-day chart drew
 *     one bar in the wrong decade.
 *   - a bound written as raw SQL has to be seconds too. `getTime()` is
 *     milliseconds, so `created_at < <ms>` is true of every row ever written —
 *     the previous period silently included the current one, and the trend
 *     arrow pointed the wrong way.
 *
 * So bounds go through drizzle's `gte`/`lt` with a Date, which converts to the
 * column's own unit. Don't hand-roll the comparison.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PageViewStats {
  totalViews: number;
  /**
   * People rather than hits, as far as a day-scoped token can tell. Summed
   * across days, so someone returning on Tuesday counts twice — the token is
   * deliberately unable to say otherwise. See `visitor.ts`.
   */
  uniqueVisitors: number;
  uniquePaths: number;
  viewsByDay: { date: string; count: number }[];
  viewsByPath: { path: string; count: number }[];
  viewsByReferrer: { referrer: string; count: number }[];
  viewsByCountry: { country: string; count: number }[];
  viewsByDevice: { device: string; count: number }[];
}

export interface LinkClickStats {
  totalClicks: number;
  clicksByLink: {
    linkId: number;
    label: string | null;
    platform: string;
    url: string;
    count: number;
  }[];
  clicksByDay: { date: string; count: number }[];
  clicksByReferrer: { referrer: string; count: number }[];
  clicksByCountry: { country: string; count: number }[];
}

export interface OverviewStats {
  todayViews: number;
  weekViews: number;
  monthViews: number;
  todayClicks: number;
  weekClicks: number;
  monthClicks: number;
  topReferrer: string | null;
  topLink: { label: string | null; platform: string; clicks: number } | null;
}

function getDateRange(period: 'today' | 'week' | 'month' | 'year'): DateRange {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end: now };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const today = getDateRange('today');
  const week = getDateRange('week');
  const month = getDateRange('month');

  // Get view counts
  const [todayViewsResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, today.start));

  const [weekViewsResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, week.start));

  const [monthViewsResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, month.start));

  // Get click counts
  const [todayClicksResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, today.start));

  const [weekClicksResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, week.start));

  const [monthClicksResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, month.start));

  // Get top referrer (last 30 days, excluding direct)
  const topReferrers = await db
    .select({
      referrer: pageViews.referrer,
      count: count()
    })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, month.start), sql`${pageViews.referrer} != 'direct'`))
    .groupBy(pageViews.referrer)
    .orderBy(desc(count()))
    .limit(1);

  // Get top clicked link (last 30 days)
  const topLinks = await db
    .select({
      linkId: linkClicks.linkId,
      count: count()
    })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, month.start))
    .groupBy(linkClicks.linkId)
    .orderBy(desc(count()))
    .limit(1);

  let topLink: OverviewStats['topLink'] = null;
  if (topLinks.length > 0) {
    const [linkData] = await db
      .select()
      .from(links)
      .where(eq(links.id, topLinks[0].linkId))
      .limit(1);
    if (linkData) {
      topLink = {
        label: linkData.label,
        platform: linkData.platform,
        clicks: topLinks[0].count
      };
    }
  }

  return {
    todayViews: todayViewsResult?.count ?? 0,
    weekViews: weekViewsResult?.count ?? 0,
    monthViews: monthViewsResult?.count ?? 0,
    todayClicks: todayClicksResult?.count ?? 0,
    weekClicks: weekClicksResult?.count ?? 0,
    monthClicks: monthClicksResult?.count ?? 0,
    topReferrer: topReferrers.length > 0 ? topReferrers[0].referrer : null,
    topLink
  };
}

/**
 * How one release is doing.
 *
 * Joined through `links.releaseId` rather than kept in its own table: a click
 * has always pointed at a link, and a link now knows which release it belongs
 * to, so the release dimension costs a join rather than a schema.
 */
export interface ReleaseClickStats {
  total: number;
  byPlatform: { platform: string; label: string | null; count: number }[];
  byDevice: { device: string; count: number }[];
  byCountry: { country: string; count: number }[];
}

export async function getReleaseClickStats(
  releaseId: number,
  days: number = 30
): Promise<ReleaseClickStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = and(eq(links.releaseId, releaseId), gte(linkClicks.createdAt, since));

  const [totalRow] = await db
    .select({ count: count() })
    .from(linkClicks)
    .innerJoin(links, eq(links.id, linkClicks.linkId))
    .where(scope);

  const byPlatform = await db
    .select({ platform: links.platform, label: links.label, count: count() })
    .from(linkClicks)
    .innerJoin(links, eq(links.id, linkClicks.linkId))
    .where(scope)
    .groupBy(links.platform, links.label)
    .orderBy(desc(count()));

  const byDevice = await db
    .select({ device: sql<string>`coalesce(${linkClicks.device}, 'unknown')`, count: count() })
    .from(linkClicks)
    .innerJoin(links, eq(links.id, linkClicks.linkId))
    .where(scope)
    .groupBy(linkClicks.device)
    .orderBy(desc(count()));

  const byCountry = await db
    .select({ country: sql<string>`coalesce(${linkClicks.country}, 'unknown')`, count: count() })
    .from(linkClicks)
    .innerJoin(links, eq(links.id, linkClicks.linkId))
    .where(scope)
    .groupBy(linkClicks.country)
    .orderBy(desc(count()))
    .limit(8);

  return {
    total: totalRow?.count ?? 0,
    byPlatform,
    byDevice,
    byCountry
  };
}

/**
 * Views of one page. Visitors are counted per day, since that's as long as a
 * visitor code lives, and added up — the same way the stats page counts them.
 */
export async function getPathViewStats(
  path: string,
  days: number = 30
): Promise<{ views: number; visitors: number }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      views: count(),
      visitors: sql<number>`count(distinct ${pageViews.visitor})`
    })
    .from(pageViews)
    .where(and(eq(pageViews.path, path), gte(pageViews.createdAt, since)));
  return { views: row?.views ?? 0, visitors: row?.visitors ?? 0 };
}

/** Pre-save or ticket clicks on one release or show. */
export async function getActionClickCount(
  action: 'presave' | 'tickets',
  subjectId: number,
  days: number = 30
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(actionClicks)
    .where(
      and(
        eq(actionClicks.action, action),
        eq(actionClicks.subjectId, subjectId),
        gte(actionClicks.createdAt, since)
      )
    );
  return row?.total ?? 0;
}

/*
 * ---------------------------------------------------------------------------
 * History: the stats page's window, reaching past the ninety days of raw rows.
 *
 * A row per visit is kept for ninety days, then added up into one row per day
 * per combination (see analytics-retention.ts). So any window can straddle
 * two shapes of the same data, and every query below reads a union of both:
 * the raw rows counted as 1 each, the daily rows as their stored total.
 *
 * They never overlap. A raw row is deleted in the same transaction that adds it
 * to its day, so a given visit is in exactly one of the two at any moment.
 *
 * Windows are whole UTC days, because that's the grain the daily tables have:
 * a window that started at 14:37 would have no honest answer for the day it
 * started on once that day was rolled up.
 * ---------------------------------------------------------------------------
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A span of whole UTC days, `from` included and `to` not, as YYYY-MM-DD. */
export interface StatsWindow {
  from: string;
  to: string;
  days: number;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last `days` days, today included — or the same length `back` windows earlier. */
export function statsWindow(days: number, back = 0): StatsWindow {
  const now = new Date();
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;
  const to = tomorrow - back * days * DAY_MS;
  return { from: isoDay(to - days * DAY_MS), to: isoDay(to), days };
}

/** Everything recorded, from the first day anything was. */
export async function allTimeWindow(): Promise<StatsWindow> {
  const [row] = db.all<{ first: string | null }>(sql`
    SELECT min(day) AS first FROM (
      SELECT min(date(created_at, 'unixepoch')) AS day FROM page_views
      UNION ALL SELECT min(date) FROM page_view_daily
      UNION ALL SELECT min(date(created_at, 'unixepoch')) FROM link_clicks
      UNION ALL SELECT min(date) FROM link_click_daily
    )`);
  const today = statsWindow(1);
  if (!row?.first) return today;
  const days = Math.round((Date.parse(today.to) - Date.parse(row.first)) / DAY_MS);
  return { from: row.first, to: today.to, days: Math.max(days, 1) };
}

/** A calendar year — up to today, for the one we're in. */
export function yearWindow(year: number): StatsWindow {
  const today = statsWindow(1);
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01` < today.to ? `${year + 1}-01-01` : today.to;
  return { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) };
}

/**
 * The same dates a year earlier, which is what a year compares against: this
 * year so far beside the same stretch of last year, not beside the 260 days
 * that happen to precede it.
 */
export function yearBefore(w: StatsWindow): StatsWindow {
  const back = (day: string) => `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`;
  const from = back(w.from);
  const to = back(w.to);
  return { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) };
}

/** Every year with anything recorded in it, newest first. */
export async function dataYears(): Promise<number[]> {
  const first = Number((await allTimeWindow()).from.slice(0, 4));
  const current = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = current; y >= first; y--) years.push(y);
  return years;
}

function toWindow(period: number | StatsWindow): StatsWindow {
  return typeof period === 'number' ? statsWindow(period) : period;
}

/** The window's bounds as the epoch seconds `created_at` is stored in. */
const epochOf = (day: string) => sql`CAST(strftime('%s', ${day}) AS INTEGER)`;

/** Page views in a window, one row per visit or per rolled-up combination. */
function viewRows(w: StatsWindow) {
  return sql`
    SELECT date(created_at, 'unixepoch') AS day, path, referrer, country, device, 1 AS n
    FROM page_views WHERE created_at >= ${epochOf(w.from)} AND created_at < ${epochOf(w.to)}
    UNION ALL
    SELECT date AS day, path, referrer, country, device, views AS n
    FROM page_view_daily WHERE date >= ${w.from} AND date < ${w.to}`;
}

/** Visitors per day. Distinct within a day, which is as long as a visitor code lives. */
function visitorRows(w: StatsWindow) {
  return sql`
    SELECT date(created_at, 'unixepoch') AS day, count(DISTINCT visitor) AS n
    FROM page_views
    WHERE visitor IS NOT NULL AND created_at >= ${epochOf(w.from)} AND created_at < ${epochOf(w.to)}
    GROUP BY day
    UNION ALL
    SELECT date AS day, visitors AS n
    FROM page_view_daily_visitors WHERE date >= ${w.from} AND date < ${w.to}`;
}

/** Link clicks in a window, in the same two shapes. */
function clickRows(w: StatsWindow) {
  return sql`
    SELECT date(created_at, 'unixepoch') AS day, link_id, referrer, country, device, 1 AS n
    FROM link_clicks WHERE created_at >= ${epochOf(w.from)} AND created_at < ${epochOf(w.to)}
    UNION ALL
    SELECT date AS day, link_id, referrer, country, device, clicks AS n
    FROM link_click_daily WHERE date >= ${w.from} AND date < ${w.to}`;
}

/** Pre-save and ticket clicks in a window. */
function actionRows(w: StatsWindow) {
  return sql`
    SELECT action, subject_id, 1 AS n
    FROM action_clicks WHERE created_at >= ${epochOf(w.from)} AND created_at < ${epochOf(w.to)}
    UNION ALL
    SELECT action, subject_id, clicks AS n
    FROM action_click_daily WHERE date >= ${w.from} AND date < ${w.to}`;
}

type Counted<K extends string> = Record<K, string | null> & { count: number };

/** Rows summed by one column, largest first. */
function sumBy<K extends string>(rows: ReturnType<typeof sql>, column: K, limit?: number) {
  const col = sql.raw(column);
  return db
    .all<Counted<K>>(
      sql`SELECT ${col} AS ${col}, sum(n) AS count FROM (${rows}) GROUP BY ${col} ORDER BY count DESC ${
        limit ? sql`LIMIT ${limit}` : sql``
      }`
    )
    .map((r) => ({ ...r, count: Number(r.count) }));
}

function total(rows: ReturnType<typeof sql>): number {
  const [row] = db.all<{ total: number | null }>(sql`SELECT sum(n) AS total FROM (${rows})`);
  return Number(row?.total ?? 0);
}

function byDay(rows: ReturnType<typeof sql>): { date: string; count: number }[] {
  return db
    .all<{ date: string; count: number }>(
      sql`SELECT day AS date, sum(n) AS count FROM (${rows}) GROUP BY day ORDER BY day`
    )
    .map((r) => ({ date: r.date, count: Number(r.count) }));
}

export async function getPageViewStats(period: number | StatsWindow = 30): Promise<PageViewStats> {
  const w = toWindow(period);
  const rows = viewRows(w);

  const [paths] = db.all<{ n: number }>(sql`SELECT count(DISTINCT path) AS n FROM (${rows})`);

  return {
    totalViews: total(rows),
    /*
     * Distinct codes per day, then added up. The code changes at midnight by
     * design, so the same person on three days is three codes whatever we do —
     * summing per-day counts at least makes each day honest on its own, and is
     * what every cookieless tracker reports.
     */
    uniqueVisitors: total(visitorRows(w)),
    uniquePaths: Number(paths?.n ?? 0),
    viewsByDay: byDay(rows),
    // More than are shown, so rows from before a path stopped counting can be
    // dropped by the reader and still leave ten.
    viewsByPath: sumBy(rows, 'path', 20).map((r) => ({ path: r.path ?? '', count: r.count })),
    viewsByReferrer: sumBy(rows, 'referrer', 10).map((r) => ({
      referrer: r.referrer ?? 'direct',
      count: r.count
    })),
    viewsByCountry: sumBy(rows, 'country')
      .filter((r) => r.country)
      .slice(0, 10)
      .map((r) => ({ country: r.country ?? 'Unknown', count: r.count })),
    viewsByDevice: sumBy(rows, 'device')
      .filter((r) => r.device)
      .map((r) => ({ device: r.device ?? 'unknown', count: r.count }))
  };
}

export async function getLinkClickStats(
  period: number | StatsWindow = 30
): Promise<LinkClickStats> {
  const w = toWindow(period);
  const rows = clickRows(w);

  const top = sumBy(rows, 'link_id', 20).map((r) => ({
    linkId: Number(r.link_id),
    count: r.count
  }));
  const linkIds = top.map((r) => r.linkId);
  const linkDetails = linkIds.length
    ? await db
        .select()
        .from(links)
        .where(sql`${links.id} IN (${sql.join(linkIds, sql`, `)})`)
    : [];
  const linkMap = new Map(linkDetails.map((l) => [l.id, l]));

  return {
    totalClicks: total(rows),
    clicksByLink: top.map((r) => {
      const link = linkMap.get(r.linkId);
      return {
        linkId: r.linkId,
        // A click outlives its link; say so rather than "unknown".
        label: link ? link.label : 'Removed link',
        platform: link?.platform ?? 'unknown',
        url: link?.url ?? '',
        count: r.count
      };
    }),
    clicksByDay: byDay(rows),
    clicksByReferrer: sumBy(rows, 'referrer', 10).map((r) => ({
      referrer: r.referrer ?? 'direct',
      count: r.count
    })),
    clicksByCountry: sumBy(rows, 'country')
      .filter((r) => r.country)
      .slice(0, 10)
      .map((r) => ({ country: r.country ?? 'Unknown', count: r.count }))
  };
}

/**
 * Views by day in the window compared against, for the chart's dashed line —
 * the window before the last `days`, or the one given.
 */
export async function getPreviousPeriodViewsByDay(
  previous: number | StatsWindow = 30
): Promise<{ date: string; count: number }[]> {
  return byDay(viewRows(typeof previous === 'number' ? statsWindow(previous, 1) : previous));
}

/**
 * Views and clicks in a window and in the one it's compared against, for the
 * change figures. Given a number of days, that's the same length just before.
 */
export async function getComparisonStats(
  period: number | StatsWindow = 30,
  against?: StatsWindow
): Promise<{
  currentViews: number;
  previousViews: number;
  currentClicks: number;
  previousClicks: number;
}> {
  const current = toWindow(period);
  const previous =
    against ?? (typeof period === 'number' ? statsWindow(period, 1) : statsWindow(current.days, 1));
  return {
    currentViews: total(viewRows(current)),
    previousViews: total(viewRows(previous)),
    currentClicks: total(clickRows(current)),
    previousClicks: total(clickRows(previous))
  };
}

/**
 * Pre-save and ticket clicks, each named by what was clicked — the release's
 * title, the show's title or venue and date.
 */
export async function getActionClickSummary(
  period: number | StatsWindow = 30
): Promise<{ action: 'presave' | 'tickets'; subjectId: number; label: string; count: number }[]> {
  const rows = db
    .all<{ action: string; subject_id: number; count: number }>(
      sql`SELECT action, subject_id, sum(n) AS count FROM (${actionRows(toWindow(period))})
          GROUP BY action, subject_id ORDER BY count DESC`
    )
    .map((r) => ({ action: r.action, subjectId: Number(r.subject_id), count: Number(r.count) }));
  if (!rows.length) return [];

  const [releaseRows, showRows] = await Promise.all([
    db.select({ id: releases.id, title: releases.title }).from(releases),
    db
      .select({ id: shows.id, title: shows.title, venue: shows.venue, date: shows.date })
      .from(shows)
  ]);
  const releaseTitles = new Map(releaseRows.map((r) => [r.id, r.title]));
  const showLabels = new Map(
    showRows.map((s) => [s.id, s.title || `${s.venue?.name ?? 'Show'}, ${s.date}`])
  );

  return rows.map((r) => {
    const action = r.action === 'tickets' ? 'tickets' : 'presave';
    const label =
      (action === 'tickets' ? showLabels.get(r.subjectId) : releaseTitles.get(r.subjectId)) ??
      (action === 'tickets' ? 'Removed show' : 'Removed release');
    return { action, subjectId: r.subjectId, label, count: r.count };
  });
}
