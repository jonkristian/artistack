import { randomBytes, randomUUID } from 'crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from './db';
import { user, userInvite } from './auth-schema';
import { profile } from './schema';
import { sendEmail } from './email';
import { renderEmail, escapeHtml } from './email-template';
import { env } from '$env/dynamic/private';

/**
 * A week. Long enough that an invite survives a holiday, short enough that a
 * forgotten one doesn't stay a working door into the admin forever.
 */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteUrl(token: string, origin?: string): string {
  const base = origin || env.BETTER_AUTH_BASE_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/invite/${token}`;
}

/**
 * Replaces any outstanding invite for this person rather than adding a second
 * one, so "resend" can't leave two live links with different expiry dates.
 */
export async function createInvite(userId: string, invitedBy?: string): Promise<string> {
  await db
    .delete(userInvite)
    .where(and(eq(userInvite.userId, userId), isNull(userInvite.acceptedAt)));

  const token = randomBytes(32).toString('base64url');
  await db.insert(userInvite).values({
    id: randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    invitedBy
  });

  return token;
}

/** The invite, the person it's for, and nothing if it's spent or stale. */
export async function findValidInvite(token: string) {
  const [row] = await db
    .select({
      id: userInvite.id,
      userId: userInvite.userId,
      name: user.name,
      email: user.email
    })
    .from(userInvite)
    .innerJoin(user, eq(user.id, userInvite.userId))
    .where(
      and(
        eq(userInvite.token, token),
        isNull(userInvite.acceptedAt),
        gt(userInvite.expiresAt, new Date())
      )
    )
    .limit(1);

  return row ?? null;
}

export async function markInviteAccepted(id: string): Promise<void> {
  await db.update(userInvite).set({ acceptedAt: new Date() }).where(eq(userInvite.id, id));
}

/**
 * Sends the invite. A failure here isn't fatal — the caller falls back to
 * handing over the link itself, which beats a half-created user and an error.
 */
export async function sendInviteEmail(
  to: string,
  name: string,
  url: string,
  /**
   * A nudge rather than a first invitation.
   *
   * Same link, different tone: someone a week late didn't refuse, they meant to
   * do it and forgot. Repeating the original word for word reads like the first
   * one failed to send.
   */
  reminder = false
): Promise<{ success: boolean; error?: string }> {
  // The act's name, not the software's — the invite comes from the act.
  const [artist] = await db.select({ name: profile.name }).from(profile).limit(1);
  const site = artist?.name || 'Artistack';
  const firstName = name.split(' ')[0] || name;

  const heading = reminder
    ? `Still there? Your ${site} account is waiting`
    : `You've been invited to ${site}`;

  const opening = reminder
    ? `Hi ${escapeHtml(firstName)} — you were added to ${escapeHtml(site)} a week ago and haven't picked a password yet. Here's a fresh link.`
    : `Hi ${escapeHtml(firstName)}, you've been added to ${escapeHtml(site)}. Pick a password to finish setting up your account.`;

  const html = await renderEmail({
    heading,
    preview: reminder
      ? 'A fresh link to finish setting up your account.'
      : 'Pick a password to finish setting up your account.',
    origin: new URL(url).origin,
    body: `<p style="margin:0 0 8px;">${opening}</p>`,
    action: { label: 'Set your password', url },
    footer: `Or paste this into your browser:<br><span style="word-break:break-all;">${url}</span><br><br>The link works for seven days.`
  });

  return sendEmail({
    to,
    subject: heading,
    text: `${reminder ? `Hi ${firstName},\n\nYou were added to ${site} a week ago and haven't picked a password yet. Here's a fresh link:` : `Hi ${firstName},\n\nYou've been added to ${site}. Pick a password to finish setting up your account:`}\n\n${url}\n\nThe link works for seven days.`,
    html
  });
}

/**
 * The one nudge, a week on.
 *
 * An invitation that lapses is almost never a refusal — it's someone who meant
 * to do it and let the email slide down their inbox. A week later they get a
 * fresh link and one more chance to use it.
 *
 * The token is replaced on the existing row rather than through `createInvite`,
 * which deletes and re-creates. That would take `remindedAt` with it, and the
 * whole point of the column is that it survives — one reminder, not one per
 * hour for the rest of the account's life.
 *
 * Returns how many went out, so a scheduler tick can say nothing when there was
 * nothing to do.
 */
export async function remindStaleInvites(origin: string): Promise<number> {
  const cutoff = new Date(Date.now() - INVITE_TTL_MS);

  const stale = await db
    .select({
      id: userInvite.id,
      userId: userInvite.userId,
      email: user.email,
      name: user.name
    })
    .from(userInvite)
    .innerJoin(user, eq(user.id, userInvite.userId))
    .where(
      and(
        isNull(userInvite.acceptedAt),
        isNull(userInvite.remindedAt),
        lt(userInvite.createdAt, cutoff)
      )
    );

  let sent = 0;

  for (const invite of stale) {
    const token = randomBytes(32).toString('base64url');

    /*
     * Marked as reminded whether or not the mail leaves. A send that fails
     * would otherwise be retried every hour forever, and the admin screen still
     * offers a Resend button for the case where it genuinely needs another go.
     */
    await db
      .update(userInvite)
      .set({
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        remindedAt: new Date()
      })
      .where(eq(userInvite.id, invite.id));

    const result = await sendInviteEmail(
      invite.email,
      invite.name,
      `${origin}/invite/${token}`,
      true
    );

    if (result.success) sent++;
    else console.error(`[invites] reminder to ${invite.email} failed:`, result.error);
  }

  return sent;
}
