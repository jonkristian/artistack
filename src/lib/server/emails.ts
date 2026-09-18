import { sendEmail } from './email';
import { renderEmail, siteName, escapeHtml } from './email-template';
import { platformsInCategory, platformLabel } from '$lib/utils/platforms';

/**
 * The emails this app sends, one function each.
 *
 * Named rather than written inline where they happen to be triggered. The
 * password reset lived inside the auth plugin's callback, which meant nothing
 * else could send one — so there was no way to look at it without asking for a
 * reset, and no way to check the branding after changing a colour.
 */

/** The one-time code for a forgotten password. */
export async function sendPasswordResetEmail(to: string, otp: string) {
  const html = await renderEmail({
    heading: 'Password reset',
    preview: 'Your one-time code, good for ten minutes.',
    body: `
      <p style="margin:0 0 12px;">Your password reset code is:</p>
      <div style="text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;padding:12px 0;">${otp}</div>`,
    footer:
      'This code expires in ten minutes. If you did not ask for it, you can ignore this email.'
  });

  return sendEmail({
    to,
    subject: 'Password reset code',
    text: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
    html
  });
}

/**
 * The one email a sign-up gets.
 *
 * Sent because it is the only thing that proves the address works — a typo
 * otherwise sits on the list until a release day send bounces off it — and
 * because someone should hold the way off a list from the moment they are on
 * it, rather than waiting for a first mailing that might be months away. If
 * they never meant to join, this is what tells them.
 *
 * Deliberately not a newsletter. It says what they will get and when, and
 * nothing else: the next thing they hear should be an actual release.
 */
export async function sendWelcomeEmail(to: string, token: string, origin: string) {
  const site = await siteName();

  const html = await renderEmail({
    heading: 'You’re on the list',
    preview: `You’ll hear from ${site} when there’s something new.`,
    body: `
      <p style="margin:0 0 12px;">Thanks. You’ll get an email when there’s a new release, and when there's something worth telling you about. Nothing else, and never your address to anyone else.</p>
      <p style="margin:0;">If this wasn’t you, the link at the bottom takes you straight off the list. No account, no questions.</p>`,
    action: origin ? { label: `Visit ${site}`, url: origin } : undefined,
    footer: `You’re on the list because you asked on ${site}. <a href="${origin}/unsubscribe/${token}" style="color:inherit;">Unsubscribe</a> whenever you like.`,
    origin
  });

  return sendEmail({
    to,
    subject: 'You’re on the list',
    text: `Thanks. You're on the list for ${site}.\n\nYou'll get an email when there's a new release, and nothing else.\n\nIf this wasn't you, unsubscribe here: ${origin}/unsubscribe/${token}`,
    html
  });
}

/**
 * The record is out, to one person on the list.
 *
 * One email per subscriber rather than one with everybody in the bcc field:
 * the unsubscribe link is theirs alone, and a list that can only be left by
 * replying to the artist isn't a list anyone trusts. It also means a single bad
 * address fails on its own rather than taking the send with it.
 *
 * The sleeve leads, because that's what a record is recognised by. Alt text
 * carries the title for the many clients that don't load images at all — the
 * words below say the same thing, so nothing is lost either way.
 */
export async function sendReleaseEmail(
  release: {
    title: string;
    coverUrl: string | null;
    body: string | null;
    slug: string;
  },
  links: { id: number; platform: string; label: string | null }[],
  recipient: { to: string; token: string },
  origin: string
) {
  const site = await siteName();
  const url = `${origin}/${release.slug}`;

  /*
   * Absolute, and through /go like every other link the site hands out, so a
   * play that came from the mailing is counted with the rest rather than being
   * invisible. The cover has to be absolute too — an email has no page to be
   * relative to.
   */
  const cover = release.coverUrl
    ? release.coverUrl.startsWith('http')
      ? release.coverUrl
      : `${origin}${release.coverUrl}`
    : null;

  /*
   * Ten at most. A release delivered widely can carry thirty services, and an
   * email that lists them all buries the record under a wall of buttons — the
   * ones people actually use are at the top of the list anyway, because that's
   * the order the site keeps them in.
   *
   * The rest aren't lost: the page has every one, and the line below says so
   * rather than leaving someone to assume their service was skipped. It says it
   * without counting them, because the number is only true at the moment of
   * sending — distributors bring services up at their own pace, some on the day
   * and some later, so a page that had eleven when the email went out may have
   * fourteen by the time it's read.
   */
  const SERVICE_LIMIT = 10;
  const shown = links.slice(0, SERVICE_LIMIT);
  const remaining = links.length - shown.length;

  const services = shown
    .map(
      (link) =>
        `<a href="${origin}/go/${link.id}?src=email" style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border:1px solid currentColor;border-radius:999px;text-decoration:none;font-size:14px;color:inherit;">${escapeHtml(
          link.label ?? link.platform
        )}</a>`
    )
    .join('');

  const html = await renderEmail({
    heading: release.title,
    preview: `${release.title} is out now.`,
    body: `
      ${
        cover
          ? `<p style="margin:0 0 16px;"><a href="${url}"><img src="${cover}" alt="${escapeHtml(
              release.title
            )} cover art" width="480" style="width:100%;max-width:480px;height:auto;border-radius:8px;display:block;" /></a></p>`
          : ''
      }
      <p style="margin:0 0 12px;">It's out. Thanks for waiting.</p>
      ${release.body ?? ''}
      ${services ? `<p style="margin:16px 0 0;">${services}</p>` : ''}
      ${
        remaining > 0
          ? `<p style="margin:8px 0 0;font-size:13px;opacity:0.7;">Not your service? <a href="${url}" style="color:inherit;">They're all on the page</a>.</p>`
          : ''
      }`,
    action: { label: 'Listen now', url },
    footer: `You're getting this because you asked ${escapeHtml(
      site
    )} to tell you about new music. <a href="${origin}/unsubscribe/${
      recipient.token
    }" style="color:inherit;">Unsubscribe</a>.`,
    origin
  });

  return sendEmail({
    to: recipient.to,
    subject: `${release.title} is out`,
    text: `${release.title} is out now.\n\nListen: ${url}\n\nUnsubscribe: ${origin}/unsubscribe/${recipient.token}`,
    html
  });
}

/**
 * One of each, to whoever asked for them.
 *
 * A real feature rather than a test harness: it answers "does SMTP work" and
 * "what do these look like in my colours" in one go, and it does it by calling
 * the same senders production uses, so a preview can't drift from the thing it
 * previews.
 *
 * The order it renders is never written down. Nothing here writes to the
 * database — a sample must not put a sale in your books or an address on your
 * fan list. The release sample reads one row, because the useful question is
 * what your own record will look like rather than an invented one's.
 */
export async function sendSampleEmails(
  to: string,
  origin: string
): Promise<{ sent: string[]; failed: string[] }> {
  const { sendReceipt } = await import('./receipt');
  const { sendInviteEmail } = await import('./invites');

  const sent: string[] = [];
  const failed: string[] = [];

  const attempt = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      sent.push(label);
    } catch {
      failed.push(label);
    }
  };

  const now = new Date();

  /* A parcel: an option, a posting line, and the fan-list footer. */
  await attempt('Receipt for something to post', () =>
    sendReceipt(
      {
        id: 0,
        reference: 'AS-SAMPLE0001',
        buyerName: 'Sample Buyer',
        buyerEmail: to,
        buyerPhone: null,
        // Invented. A sample that ships with the app shouldn't carry anybody's
        // real address, least of all the person who wrote it.
        addressLine: '1 Example Road',
        postcode: '0000',
        city: 'Sampleton',
        country: 'Norway',
        provider: 'sample',
        providerReference: null,
        paymentStatus: 'authorised',
        fulfilment: 'none',
        amount: 54800,
        currency: 'NOK',
        note: null,
        marketingOptIn: true,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 0,
          orderId: 0,
          productId: null,
          name: 'Tour T-Shirt (Black)',
          unitPrice: 29900,
          quantity: 1,
          variant: 'M',
          type: 'physical',
          fileUrl: null,
          downloadToken: null
        },
        {
          id: 1,
          orderId: 0,
          productId: null,
          name: 'Debut Single (7" Vinyl)',
          unitPrice: 24900,
          quantity: 1,
          variant: null,
          type: 'physical',
          fileUrl: null,
          downloadToken: null
        }
      ],
      origin,
      // A token that leads nowhere, so a sample can't unsubscribe anyone.
      'sample-token-not-a-real-one'
    )
  );

  /* A download: charged at once, delivered by link, nothing to post. */
  await attempt('Receipt for a download', () =>
    sendReceipt(
      {
        id: 0,
        reference: 'AS-SAMPLE0002',
        buyerName: 'Sample Buyer',
        buyerEmail: to,
        buyerPhone: null,
        addressLine: null,
        postcode: null,
        city: null,
        country: null,
        provider: 'sample',
        providerReference: null,
        paymentStatus: 'captured',
        fulfilment: 'none',
        amount: 5000,
        currency: 'NOK',
        note: null,
        marketingOptIn: false,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 0,
          orderId: 0,
          productId: null,
          name: 'Debut Single (WAV)',
          unitPrice: 5000,
          quantity: 1,
          variant: null,
          type: 'digital',
          fileUrl: null,
          downloadToken: 'sample-download-token'
        }
      ],
      origin,
      null
    )
  );

  await attempt('Invite to the admin', () =>
    sendInviteEmail(to, 'Sample Person', `${origin}/login?invite=sample`)
  );

  /* The nudge a week later, which otherwise takes a week to lay eyes on. */
  await attempt('Invite reminder', () =>
    sendInviteEmail(to, 'Sample Person', `${origin}/login?invite=sample`, true)
  );

  await attempt('Password reset code', () => sendPasswordResetEmail(to, '482913'));

  /* What a new subscriber gets. A token that leads nowhere, like the receipt's. */
  await attempt('Fan list welcome', () =>
    sendWelcomeEmail(to, 'sample-token-not-a-real-one', origin)
  );

  /*
   * Release day, which otherwise can't be looked at until there is one — and by
   * then it has already gone to the list, once, unrepeatably.
   *
   * Built from the newest real release when there is one, because the question
   * this answers is "what will my fans get", and an invented record with no
   * sleeve answers a different one. The sleeve and the row of services are most
   * of what a release email is; a preview missing both isn't a preview of much.
   *
   * Falls back to something made up on a site with no releases yet, so the
   * sample run never has a hole in it.
   */
  const real = await newestReleaseForPreview();
  await attempt(real ? `A release is out: ${real.title}` : 'A release is out', () =>
    sendReleaseEmail(
      real?.release ?? {
        title: 'Sample Single',
        coverUrl: null,
        body: '<p>Recorded in a room with the door shut. Three minutes, no chorus, worth it.</p>',
        slug: 'sample-single'
      },
      // Its own services when it has any. A real release still short of them —
      // which is every release before the day — borrows a full set, because
      // two buttons don't show what a row of ten does to the layout.
      real?.links.length ? real.links : sampleServices(),
      { to, token: 'sample-token-not-a-real-one' },
      origin
    )
  );

  return { sent, failed };
}

/**
 * The newest release, as the release email needs it.
 *
 * Only for the sample: it reads the same fields `announceRelease` does, so what
 * arrives in the preview is what the list would get, and placeholder links are
 * filtered out for the same reason they are there — a button that goes to
 * example.com misrepresents the email rather than previewing it.
 */
async function newestReleaseForPreview(): Promise<{
  title: string;
  release: { title: string; coverUrl: string | null; body: string | null; slug: string };
  links: { id: number; platform: string; label: string | null }[];
} | null> {
  const { db } = await import('./db');
  const { releases, pages, links: linkTable } = await import('./schema');
  const { eq, and, desc, asc } = await import('drizzle-orm');
  const { isPlaceholderUrl } = await import('$lib/utils/platforms');

  const [row] = await db
    .select({
      id: releases.id,
      title: releases.title,
      coverUrl: releases.coverUrl,
      body: releases.body,
      slug: pages.slug
    })
    .from(releases)
    .innerJoin(pages, eq(pages.id, releases.pageId))
    .orderBy(desc(releases.releaseDate))
    .limit(1);

  if (!row) return null;

  const found = await db
    .select({
      id: linkTable.id,
      platform: linkTable.platform,
      label: linkTable.label,
      url: linkTable.url
    })
    .from(linkTable)
    .where(and(eq(linkTable.releaseId, row.id), eq(linkTable.visible, true)))
    .orderBy(asc(linkTable.position));

  return {
    title: row.title,
    release: { title: row.title, coverUrl: row.coverUrl, body: row.body, slug: row.slug },
    links: found
      .filter((link) => !isPlaceholderUrl(link.url))
      .map(({ id, platform, label }) => ({ id, platform, label }))
  };
}

/**
 * A believable row of services, for a release that hasn't got its own yet.
 *
 * Taken from the app's own list rather than typed out here, so it stays the
 * services this site can actually hold — and in the same order, which puts the
 * ones people use at the front. Twelve rather than ten, so the sample also
 * shows the "all of them are on the page" line doing its job.
 *
 * The ids lead nowhere on purpose. A sample must not add clicks to the numbers
 * for a real release.
 */
function sampleServices(): { id: number; platform: string; label: string | null }[] {
  return platformsInCategory('streaming')
    .slice(0, 12)
    .map((platform) => ({ id: 0, platform, label: platformLabel(platform) }));
}
