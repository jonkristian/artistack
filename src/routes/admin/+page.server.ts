import { requireUser } from '$lib/server/guards';
import { getSettings } from '$lib/server/settings';
import {
  getOverviewStats,
  getPageViewStats,
  getPreviousPeriodViewsByDay
} from '$lib/server/analytics';
import { db } from '$lib/server/db';
import { clipProjects, subscribers } from '$lib/server/schema';
import { and, count, desc, gte, inArray, isNull } from 'drizzle-orm';
import type { ClipStatus } from '$lib/clips/types';
import type { PageServerLoad } from './$types';

/**
 * The overview: enough of each section to know whether it wants attention.
 *
 * Only what's switched on is queried. A site without the fan list shouldn't pay
 * for counting subscribers it can't have, and the dashboard shouldn't offer a
 * number that leads nowhere.
 *
 * Releases aren't fetched here — the layout already loads them for the draft,
 * and a second copy would shadow it in merged page data.
 */
export const load: PageServerLoad = async () => {
  await requireUser();

  const settings = await getSettings();

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  /*
   * The statuses that mean a clip is waiting on a person. 'published' and
   * 'queued' are done with — a dashboard listing those is a list of things not
   * to do.
   */
  const WAITING: ClipStatus[] = ['draft', 'rendered', 'review', 'rejected'];

  const [overview, pageViews, previousPeriodViews, clipCounts, waitingClips, audience] =
    await Promise.all([
      getOverviewStats(),
      getPageViewStats(30),
      getPreviousPeriodViewsByDay(30),

      settings.clipsEnabled
        ? db
            .select({ status: clipProjects.status, total: count() })
            .from(clipProjects)
            .groupBy(clipProjects.status)
        : Promise.resolve([]),

      /*
       * The clips themselves, not just how many. The point of the tile is to be
       * a way in — a count tells you there's work without saying what it is.
       */
      settings.clipsEnabled
        ? db
            .select({
              id: clipProjects.id,
              name: clipProjects.name,
              status: clipProjects.status,
              scheduledFor: clipProjects.scheduledFor,
              outputMediaId: clipProjects.outputMediaId
            })
            .from(clipProjects)
            .where(inArray(clipProjects.status, WAITING))
            .orderBy(desc(clipProjects.updatedAt))
            .limit(5)
        : Promise.resolve([]),

      settings.subscribersEnabled
        ? Promise.all([
            db
              .select({ total: count() })
              .from(subscribers)
              .where(isNull(subscribers.unsubscribedAt)),
            db
              .select({ total: count() })
              .from(subscribers)
              .where(and(isNull(subscribers.unsubscribedAt), gte(subscribers.createdAt, monthAgo)))
          ]).then(([[active], [recent]]) => ({
            active: active?.total ?? 0,
            recent: recent?.total ?? 0
          }))
        : Promise.resolve(null)
    ]);

  return { overview, pageViews, previousPeriodViews, clipCounts, waitingClips, audience };
};
