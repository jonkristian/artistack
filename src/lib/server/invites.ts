import { randomBytes, randomUUID } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './db';
import { user, userInvite } from './auth-schema';
import { profile } from './schema';
import { sendEmail } from './email';
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
  url: string
): Promise<{ success: boolean; error?: string }> {
  // The band's name, not the software's — the invite comes from the band.
  const [artist] = await db.select({ name: profile.name }).from(profile).limit(1);
  const site = artist?.name || 'Artistack';
  const firstName = name.split(' ')[0] || name;

  return sendEmail({
    to,
    subject: `You've been invited to ${site}`,
    text: `Hi ${firstName},\n\nYou've been added to ${site}. Pick a password to finish setting up your account:\n\n${url}\n\nThe link works for seven days.`,
    html: `
      <div style="font-family: sans-serif; max-width: 440px; margin: 0 auto;">
        <h2 style="color: #8b5cf6;">You've been invited to ${site}</h2>
        <p>Hi ${firstName}, you've been added to ${site}. Pick a password to finish setting up your account.</p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #8b5cf6; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Set your password</a>
        </p>
        <p style="color: #666; font-size: 14px;">Or paste this into your browser:<br><span style="word-break: break-all;">${url}</span></p>
        <p style="color: #666; font-size: 14px;">The link works for seven days.</p>
      </div>
    `
  });
}
