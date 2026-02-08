import { db } from './db';
import { pageViews, linkClicks, links } from './schema';
import { sql, eq, gte, and, desc, count } from 'drizzle-orm';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PageViewStats {
  totalViews: number;
  uniquePaths: number;
  viewsByDay: { date: string; count: number }[];
  viewsByPath: { path: string; count: number }[];
  viewsByReferrer: { referrer: string; count: number }[];
  viewsByCountry: { country: string; count: number }[];
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

export async function getPageViewStats(days: number = 30): Promise<PageViewStats> {
  const range = {
    start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    end: new Date()
  };

  // Total views
  const [totalResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, range.start));

  // Unique paths
  const uniquePathsResult = await db
    .selectDistinct({ path: pageViews.path })
    .from(pageViews)
    .where(gte(pageViews.createdAt, range.start));

  // Views by day
  const viewsByDay = await db
    .select({
      date: sql<string>`date(${pageViews.createdAt}, 'unixepoch')`,
      count: count()
    })
    .from(pageViews)
    .where(gte(pageViews.createdAt, range.start))
    .groupBy(sql`date(${pageViews.createdAt}, 'unixepoch')`)
    .orderBy(sql`date(${pageViews.createdAt}, 'unixepoch')`);

  // Views by path
  const viewsByPath = await db
    .select({
      path: pageViews.path,
      count: count()
    })
    .from(pageViews)
    .where(gte(pageViews.createdAt, range.start))
    .groupBy(pageViews.path)
    .orderBy(desc(count()))
    .limit(10);

  // Views by referrer
  const viewsByReferrer = await db
    .select({
      referrer: pageViews.referrer,
      count: count()
    })
    .from(pageViews)
    .where(gte(pageViews.createdAt, range.start))
    .groupBy(pageViews.referrer)
    .orderBy(desc(count()))
    .limit(10);

  // Views by country
  const viewsByCountry = await db
    .select({
      country: pageViews.country,
      count: count()
    })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, range.start), sql`${pageViews.country} IS NOT NULL`))
    .groupBy(pageViews.country)
    .orderBy(desc(count()))
    .limit(10);

  return {
    totalViews: totalResult?.count ?? 0,
    uniquePaths: uniquePathsResult.length,
    viewsByDay: viewsByDay.map((r) => ({ date: r.date, count: r.count })),
    viewsByPath: viewsByPath.map((r) => ({ path: r.path, count: r.count })),
    viewsByReferrer: viewsByReferrer.map((r) => ({
      referrer: r.referrer ?? 'direct',
      count: r.count
    })),
    viewsByCountry: viewsByCountry.map((r) => ({ country: r.country ?? 'Unknown', count: r.count }))
  };
}

export async function getLinkClickStats(days: number = 30): Promise<LinkClickStats> {
  const range = {
    start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    end: new Date()
  };

  // Total clicks
  const [totalResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, range.start));

  // Clicks by link (with link details)
  const clicksByLinkId = await db
    .select({
      linkId: linkClicks.linkId,
      count: count()
    })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, range.start))
    .groupBy(linkClicks.linkId)
    .orderBy(desc(count()))
    .limit(20);

  // Fetch link details
  const linkIds = clicksByLinkId.map((r) => r.linkId);
  const linkDetails =
    linkIds.length > 0
      ? await db
          .select()
          .from(links)
          .where(sql`${links.id} IN (${sql.join(linkIds, sql`, `)})`)
      : [];

  const linkMap = new Map(linkDetails.map((l) => [l.id, l]));

  const clicksByLink = clicksByLinkId.map((r) => {
    const link = linkMap.get(r.linkId);
    return {
      linkId: r.linkId,
      label: link?.label ?? null,
      platform: link?.platform ?? 'unknown',
      url: link?.url ?? '',
      count: r.count
    };
  });

  // Clicks by day
  const clicksByDay = await db
    .select({
      date: sql<string>`date(${linkClicks.createdAt} / 1000, 'unixepoch')`,
      count: count()
    })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, range.start))
    .groupBy(sql`date(${linkClicks.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${linkClicks.createdAt} / 1000, 'unixepoch')`);

  // Clicks by referrer
  const clicksByReferrer = await db
    .select({
      referrer: linkClicks.referrer,
      count: count()
    })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, range.start))
    .groupBy(linkClicks.referrer)
    .orderBy(desc(count()))
    .limit(10);

  // Clicks by country
  const clicksByCountry = await db
    .select({
      country: linkClicks.country,
      count: count()
    })
    .from(linkClicks)
    .where(and(gte(linkClicks.createdAt, range.start), sql`${linkClicks.country} IS NOT NULL`))
    .groupBy(linkClicks.country)
    .orderBy(desc(count()))
    .limit(10);

  return {
    totalClicks: totalResult?.count ?? 0,
    clicksByLink,
    clicksByDay: clicksByDay.map((r) => ({ date: r.date, count: r.count })),
    clicksByReferrer: clicksByReferrer.map((r) => ({
      referrer: r.referrer ?? 'direct',
      count: r.count
    })),
    clicksByCountry: clicksByCountry.map((r) => ({
      country: r.country ?? 'Unknown',
      count: r.count
    }))
  };
}

// Get views by day for previous period (for chart comparison)
export async function getPreviousPeriodViewsByDay(
  days: number = 30
): Promise<{ date: string; count: number }[]> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

  const viewsByDay = await db
    .select({
      date: sql<string>`date(${pageViews.createdAt}, 'unixepoch')`,
      count: count()
    })
    .from(pageViews)
    .where(
      and(
        gte(pageViews.createdAt, previousStart),
        sql`${pageViews.createdAt} < ${Math.floor(currentStart.getTime() / 1000)}`
      )
    )
    .groupBy(sql`date(${pageViews.createdAt}, 'unixepoch')`)
    .orderBy(sql`date(${pageViews.createdAt}, 'unixepoch')`);

  return viewsByDay.map((r) => ({ date: r.date, count: r.count }));
}

// Get comparison stats for previous period
export async function getComparisonStats(days: number = 30): Promise<{
  currentViews: number;
  previousViews: number;
  currentClicks: number;
  previousClicks: number;
}> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

  const [currentViewsResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, currentStart));

  const [previousViewsResult] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(
      and(
        gte(pageViews.createdAt, previousStart),
        sql`${pageViews.createdAt} < ${currentStart.getTime()}`
      )
    );

  const [currentClicksResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(gte(linkClicks.createdAt, currentStart));

  const [previousClicksResult] = await db
    .select({ count: count() })
    .from(linkClicks)
    .where(
      and(
        gte(linkClicks.createdAt, previousStart),
        sql`${linkClicks.createdAt} < ${currentStart.getTime()}`
      )
    );

  return {
    currentViews: currentViewsResult?.count ?? 0,
    previousViews: previousViewsResult?.count ?? 0,
    currentClicks: currentClicksResult?.count ?? 0,
    previousClicks: previousClicksResult?.count ?? 0
  };
}
