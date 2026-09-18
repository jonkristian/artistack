import { sql, lt, and, isNotNull } from 'drizzle-orm';
import { db } from './db';
import {
  pageViews,
  pageViewDaily,
  pageViewDailyVisitors,
  linkClicks,
  linkClickDaily
} from './schema';

/**
 * Keeping the numbers and letting go of the visits.
 *
 * A row per page view, kept forever, is the thing a retention policy exists to
 * prevent — and the privacy page already tells people it doesn't happen. But
 * deleting outright would throw away the only record of how a release did, so
 * old rows are added up first and then removed: the same dimensions, one row
 * per day per combination, with nothing left that describes an individual
 * visit.
 *
 * Ninety days is comfortably past everything the admin actually asks for — the
 * stats screen never looks back further than thirty — so nothing on screen
 * changes when a day crosses the line.
 */

/** How long a row that describes one visit is allowed to exist. */
const RAW_RETENTION_DAYS = 90;

export interface RetentionResult {
  /** Days summarised on this run. */
  days: number;
  /** Raw rows removed. */
  removed: number;
}

/**
 * Rolls every day older than the window into the daily tables, then deletes the
 * rows it summarised.
 *
 * Done as one transaction per run so a crash can't leave a day counted twice —
 * the delete is what makes the insert final, and neither lands without the
 * other.
 */
export async function rollUpOldPageViews(): Promise<RetentionResult> {
  const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [pending] = await db
    .select({ days: sql<number>`count(distinct date(${pageViews.createdAt}, 'unixepoch'))` })
    .from(pageViews)
    .where(lt(pageViews.createdAt, cutoff));

  if (!pending?.days) return { days: 0, removed: 0 };

  /*
   * Visitor counts are worked out before the dimension rollup and stored on
   * their own, because a distinct count doesn't survive being grouped: summing
   * per-path visitors would count anyone who read two pages twice.
   */
  const visitorsByDay = await db
    .select({
      date: sql<string>`date(${pageViews.createdAt}, 'unixepoch')`,
      visitors: sql<number>`count(distinct ${pageViews.visitor})`
    })
    .from(pageViews)
    .where(and(lt(pageViews.createdAt, cutoff), isNotNull(pageViews.visitor)))
    .groupBy(sql`date(${pageViews.createdAt}, 'unixepoch')`);

  const rows = await db
    .select({
      date: sql<string>`date(${pageViews.createdAt}, 'unixepoch')`,
      path: pageViews.path,
      referrer: pageViews.referrer,
      country: pageViews.country,
      device: pageViews.device,
      views: sql<number>`count(*)`
    })
    .from(pageViews)
    .where(lt(pageViews.createdAt, cutoff))
    .groupBy(
      sql`date(${pageViews.createdAt}, 'unixepoch')`,
      pageViews.path,
      pageViews.referrer,
      pageViews.country,
      pageViews.device
    );

  let removed = 0;

  db.transaction((tx) => {
    // In batches: SQLite caps the parameters in one statement.
    for (let i = 0; i < rows.length; i += 500) {
      tx.insert(pageViewDaily).values(rows.slice(i, i + 500)).run();
    }

    for (const day of visitorsByDay) {
      /*
       * A day can only be rolled up once, but a second run finding the same
       * date — a clock change, a re-run after a partial failure — must not
       * double it. Last write wins on the day's own row.
       */
      tx.insert(pageViewDailyVisitors)
        .values(day)
        .onConflictDoUpdate({
          target: pageViewDailyVisitors.date,
          set: { visitors: day.visitors }
        })
        .run();
    }

    const result = tx.delete(pageViews).where(lt(pageViews.createdAt, cutoff)).run();
    removed = result.changes;
  });

  return { days: pending.days, removed };
}

/**
 * The same for link clicks, which were being kept forever while the privacy
 * page said ninety days. Simpler than page views: a click carries no visitor,
 * so there's no distinct count to keep apart from the totals.
 */
export async function rollUpOldLinkClicks(): Promise<RetentionResult> {
  const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const day = sql<string>`date(${linkClicks.createdAt}, 'unixepoch')`;

  const rows = await db
    .select({
      date: day,
      linkId: linkClicks.linkId,
      referrer: linkClicks.referrer,
      country: linkClicks.country,
      device: linkClicks.device,
      clicks: sql<number>`count(*)`
    })
    .from(linkClicks)
    .where(lt(linkClicks.createdAt, cutoff))
    .groupBy(day, linkClicks.linkId, linkClicks.referrer, linkClicks.country, linkClicks.device);

  if (!rows.length) return { days: 0, removed: 0 };

  let removed = 0;
  // One transaction, as above: the delete is what makes the insert final.
  db.transaction((tx) => {
    // Batched for the same reason, and the first run here rolls up months.
    for (let i = 0; i < rows.length; i += 500) {
      tx.insert(linkClickDaily).values(rows.slice(i, i + 500)).run();
    }
    removed = tx.delete(linkClicks).where(lt(linkClicks.createdAt, cutoff)).run().changes;
  });

  return { days: new Set(rows.map((r) => r.date)).size, removed };
}
