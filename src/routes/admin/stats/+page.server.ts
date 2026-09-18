import { db } from '$lib/server/db';
import { profile, pages, clipProjects } from '$lib/server/schema';
import { slugify } from '$lib/utils/slug';
import { isTrackedPath } from '$lib/utils/tracked-paths';
import {
  getPageViewStats,
  getLinkClickStats,
  getComparisonStats,
  getPreviousPeriodViewsByDay,
  getActionClickSummary,
  statsWindow,
  allTimeWindow,
  yearWindow,
  yearBefore,
  dataYears
} from '$lib/server/analytics';
import { getCachedSocialStats } from '$lib/server/social-stats';
import type { PageServerLoad } from './$types';

/** The windows on offer, by what goes in the address. */
const PERIODS = {
  '7': { days: 7, label: '7 days' },
  '30': { days: 30, label: '30 days' },
  '90': { days: 90, label: '90 days' },
  '365': { days: 365, label: '12 months' },
  all: { days: null, label: 'All time' }
} as const;
type Period = keyof typeof PERIODS;

/** Percent change, or null when there's nothing to compare against. */
function change(current: number, previous: number): number | null {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : null;
}

export const load: PageServerLoad = async ({ url }) => {
  const years = await dataYears();
  const asked = url.searchParams.get('period') ?? '30';

  /*
   * A rolling window, a calendar year, or everything. A year compares with the
   * same dates the year before; a rolling window with the stretch just before
   * it; all time with nothing, since there's nothing before it.
   */
  const year = /^\d{4}$/.test(asked) && years.includes(Number(asked)) ? Number(asked) : null;
  const period: string = year ? asked : asked in PERIODS ? asked : '30';
  const fixedDays = year ? null : PERIODS[period as Period].days;

  const window = year
    ? yearWindow(year)
    : fixedDays
      ? statsWindow(fixedDays)
      : await allTimeWindow();
  const previous = year ? yearBefore(window) : fixedDays ? statsWindow(fixedDays, 1) : null;
  const periodLabel = year ? String(year) : PERIODS[period as Period].label;

  const [
    pageViews,
    linkClicks,
    comparison,
    previousPeriodViews,
    profileData,
    socialStats,
    actionClicks
  ] = await Promise.all([
    getPageViewStats(window),
    getLinkClickStats(window),
    previous ? getComparisonStats(window, previous) : null,
    previous ? getPreviousPeriodViewsByDay(previous) : null,
    db.select().from(profile).limit(1),
    getCachedSocialStats(),
    getActionClickSummary(window)
  ]);

  return {
    period,
    periods: Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label })),
    // Only once there's a year other than this one to pick.
    years: years.length > 1 ? years : [],
    periodLabel,
    // "vs previous 30 days", "vs 2025".
    comparedTo: year ? String(year - 1) : `previous ${periodLabel}`,
    days: window.days,
    from: window.from,
    previousFrom: previous?.from ?? null,
    pageViews,
    linkClicks,
    previousPeriodViews,
    viewsChange: comparison ? change(comparison.currentViews, comparison.previousViews) : null,
    clicksChange: comparison ? change(comparison.currentClicks, comparison.previousClicks) : null,
    // The most-sent-from and most-pressed in this window, for the headline tiles.
    topReferrer: pageViews.viewsByReferrer.find((r) => r.referrer !== 'direct')?.referrer ?? null,
    topLink: linkClicks.clicksByLink[0] ?? null,
    currentViews: pageViews.totalViews,
    currentClicks: linkClicks.totalClicks,
    actionClicks,
    profile: profileData[0] ?? null,
    socialStats,
    topPages: await nameTopPages(pageViews.viewsByPath)
  };
};

/**
 * The most-viewed paths, named the way the admin names them.
 *
 * A path is an address, and "/c/i-will-be-me-teaser" says less than the clip
 * it came from. Campaign links are the reason this list matters — they're how
 * a clip posted somewhere shows whether it brought anyone — so each is matched
 * back to its clip, the same way the post sheet made the slug.
 */
async function nameTopPages(rows: { path: string; count: number }[]) {
  const [pageRows, clipRows] = await Promise.all([
    db.select({ slug: pages.slug, title: pages.title }).from(pages),
    db.select({ id: clipProjects.id, name: clipProjects.name }).from(clipProjects)
  ]);
  const pageTitles = new Map(pageRows.map((p) => [`/${p.slug}`, p.title]));
  const clipNames = new Map(clipRows.map((c) => [slugify(c.name) || `clip-${c.id}`, c.name]));

  // Rows written before a path stopped counting (files, secret links) are
  // still in the window for a while; they aren't pages.
  return rows
    .filter(({ path }) => isTrackedPath(path))
    .slice(0, 10)
    .map(({ path, count }) => {
      if (path === '/') return { path, count, label: 'Front page', campaign: false };
      if (path.startsWith('/c/')) {
        const slug = path.slice(3);
        return { path, count, label: clipNames.get(slug) ?? slug, campaign: true };
      }
      return { path, count, label: pageTitles.get(path) ?? path, campaign: false };
    });
}
