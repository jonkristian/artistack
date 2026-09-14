import { db } from './db';
import { releases, pages, links, subscribers } from './schema';
import { eq, and, isNull, asc, lte } from 'drizzle-orm';
import { sendReleaseEmail } from './emails';
import { isPlaceholderUrl } from '$lib/utils/platforms';

/**
 * Telling the fan list a record is out.
 *
 * One function for both ways it happens — the scheduler on release day and the
 * button on the release — because the interesting part is everything that
 * isn't the send: who is still on the list, whether this has gone out already,
 * and refusing to mail hundreds of people a page with no links on it. Two
 * copies of that would eventually disagree, and the way you'd find out is a
 * mailing you can't take back.
 */
export type AnnounceResult =
  { sent: number; failed: number; held?: never } | { held: string; sent?: never; failed?: never };

/**
 * How many services make an announcement worth sending on the morning itself.
 *
 * Not a rule about what a release needs — plenty reach two shops and no more —
 * only about how long to wait before accepting that's all there is.
 */
const PATIENT_SERVICE_COUNT = 3;

export async function announceRelease(
  releaseId: number,
  origin: string,
  options: { automatic?: boolean } = {}
): Promise<AnnounceResult> {
  const [row] = await db
    .select({
      id: releases.id,
      title: releases.title,
      coverUrl: releases.coverUrl,
      body: releases.body,
      releaseDate: releases.releaseDate,
      announcedAt: releases.announcedAt,
      slug: pages.slug,
      published: pages.published
    })
    .from(releases)
    .innerJoin(pages, eq(pages.id, releases.pageId))
    .where(eq(releases.id, releaseId))
    .limit(1);

  if (!row) return { held: 'That release is gone.' };
  if (row.announcedAt) return { held: 'The list has already been told about this one.' };
  if (!row.published)
    return { held: 'The release page is a draft, so there is nothing to link to.' };

  const releaseLinks = await db
    .select({ id: links.id, platform: links.platform, label: links.label, url: links.url })
    .from(links)
    .where(and(eq(links.releaseId, releaseId), eq(links.visible, true)))
    .orderBy(asc(links.position));

  /*
   * A placeholder is not a service. Counting rows rather than usable addresses
   * was the way this went wrong: a release seeded with four example.com links
   * satisfied every check, and the hold below — the one thing standing between
   * an early send and a mailing nobody can take back — never fired.
   */
  const usableLinks = releaseLinks.filter((link) => !isPlaceholderUrl(link.url));

  /*
   * An announcement with nowhere to listen is worse than a late one: it spends
   * the one message people opened for this record, and the links are usually
   * missing because the stores haven't published them yet — which is to say,
   * because it's too early to send.
   */
  if (usableLinks.length === 0) {
    return { held: 'The release has no services on it yet, so there would be nothing to press.' };
  }

  /*
   * One service is a thin announcement, and the shops rarely publish together —
   * on release morning some are up and some are an hour behind. Waiting costs a
   * day; sending costs the record, because the list is marked told before the
   * first email leaves and there is no second attempt.
   *
   * So the scheduler is patient for exactly one morning. After that it sends
   * whatever there is, because a record that reached two shops has reached two
   * shops and no amount of waiting changes it.
   *
   * Only when nobody asked. Pressing the button is someone who has looked at
   * the release deciding it's ready, and second-guessing that would leave them
   * unable to send at all.
   */
  if (options.automatic && usableLinks.length < PATIENT_SERVICE_COUNT) {
    const firstMorning = Date.now() - row.releaseDate.getTime() < 24 * 60 * 60 * 1000;
    if (firstMorning) {
      const count = usableLinks.length === 1 ? 'one service' : `${usableLinks.length} services`;
      return {
        held: `Only ${count} up so far — waiting for the rest. It goes tomorrow morning whatever happens, or now if you press the button.`
      };
    }
  }

  const list = await db
    .select({ email: subscribers.email, token: subscribers.token })
    .from(subscribers)
    .where(isNull(subscribers.unsubscribedAt));

  /*
   * Claimed before the first email rather than after the last: a crash halfway
   * through is a partial send, and sending the whole list a second time is a
   * worse repair than missing the tail of it. The count that comes back is what
   * actually went out.
   */
  await db.update(releases).set({ announcedAt: new Date() }).where(eq(releases.id, releaseId));

  let sent = 0;
  let failed = 0;

  for (const person of list) {
    try {
      await sendReleaseEmail(row, usableLinks, { to: person.email, token: person.token }, origin);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error('[announce] could not mail', person.email, err);
    }
  }

  console.log(`[announce] "${row.title}": ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

/**
 * Releases that are out, published, and haven't been announced.
 *
 * Date only — a release dated today counts from midnight, and the scheduler
 * decides what time of day is a decent hour to arrive in someone's inbox.
 */
export async function releasesAwaitingAnnouncement(): Promise<number[]> {
  const rows = await db
    .select({ id: releases.id })
    .from(releases)
    .innerJoin(pages, eq(pages.id, releases.pageId))
    .where(
      and(
        isNull(releases.announcedAt),
        lte(releases.releaseDate, new Date()),
        eq(pages.published, true)
      )
    );

  return rows.map((r) => r.id);
}
