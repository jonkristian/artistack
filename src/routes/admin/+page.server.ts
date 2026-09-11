import { requireUser } from '$lib/server/guards';
import { getSettings } from '$lib/server/settings';
import {
  getOverviewStats,
  getPageViewStats,
  getPreviousPeriodViewsByDay
} from '$lib/server/analytics';
import { db } from '$lib/server/db';
import { clipProjects, media, orders, subscribers } from '$lib/server/schema';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import { getQueue } from '$lib/server/clip-queue';
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
  // A year back is planning; further than that is history, and history is Stats.
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  /*
   * The statuses that mean a clip is waiting on a person. 'published' and
   * 'queued' are done with — a dashboard listing those is a list of things not
   * to do.
   */
  const WAITING: ClipStatus[] = ['draft', 'rendered', 'review'];

  const [overview, pageViews, previousPeriodViews, waitingClips, audience] = await Promise.all([
    getOverviewStats(),
    getPageViewStats(30),
    getPreviousPeriodViewsByDay(30),

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
      : Promise.resolve([]),

    settings.subscribersEnabled
      ? Promise.all([
          db.select({ total: count() }).from(subscribers).where(isNull(subscribers.unsubscribedAt)),
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

  /*
   * The calendar's own sources. Shows and releases aren't here: the layout
   * loads them for the draft already, and a second copy would shadow it in
   * merged page data.
   */
  const [queue, publishedClips, shopOrders, allMedia] = await Promise.all([
    settings.clipsEnabled ? getQueue() : Promise.resolve([]),

    settings.clipsEnabled
      ? db
          .select({
            id: clipProjects.id,
            name: clipProjects.name,
            publishedAt: clipProjects.publishedAt,
            outputMediaId: clipProjects.outputMediaId
          })
          .from(clipProjects)
          .where(
            and(
              eq(clipProjects.status, 'published'),
              isNotNull(clipProjects.publishedAt),
              gte(clipProjects.publishedAt, yearAgo)
            )
          )
      : Promise.resolve([]),

    /*
     * Every order worth doing something about, sent or not — the calendar draws
     * them as a to-do and strikes through the ones that have gone, so it needs
     * both. Paid for, in one sense or the other: `authorised` is money reserved
     * and `captured` is money taken, which is what happens as a parcel goes out.
     * Pending and failed ones aren't a job, they're a non-event.
     */
    settings.shopEnabled
      ? db
          .select({
            id: orders.id,
            reference: orders.reference,
            buyerName: orders.buyerName,
            amount: orders.amount,
            currency: orders.currency,
            fulfilment: orders.fulfilment,
            createdAt: orders.createdAt
          })
          .from(orders)
          .where(
            and(
              inArray(orders.paymentStatus, ['authorised', 'captured']),
              gte(orders.createdAt, yearAgo)
            )
          )
      : Promise.resolve([]),

    settings.clipsEnabled
      ? db.select({ id: media.id, thumbnailUrl: media.thumbnailUrl }).from(media)
      : Promise.resolve([])
  ]);

  const thumbs = new Map(allMedia.map((m) => [m.id, m.thumbnailUrl]));

  return {
    overview,
    pageViews,
    previousPeriodViews,
    waitingClips: waitingClips.map((clip) => ({
      ...clip,
      thumbnailUrl: clip.outputMediaId ? (thumbs.get(clip.outputMediaId) ?? null) : null
    })),
    audience,
    queue: queue.map((entry) => ({
      id: entry.project.id,
      name: entry.project.name,
      eta: entry.eta,
      /** A date somebody chose, rather than one the drip worked out. */
      dated: entry.project.scheduledFor != null,
      thumbnailUrl: entry.output?.thumbnailUrl ?? null
    })),
    publishedClips: publishedClips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      publishedAt: clip.publishedAt,
      thumbnailUrl: clip.outputMediaId ? (thumbs.get(clip.outputMediaId) ?? null) : null
    })),
    orders: shopOrders.map((order) => ({
      ...order,
      /** Out of your hands: posted, or already through the door. */
      sent: order.fulfilment === 'shipped' || order.fulfilment === 'delivered'
    }))
  };
};
