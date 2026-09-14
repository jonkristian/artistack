import * as v from 'valibot';
import { command, getRequestEvent } from '$app/server';
import { and, eq, ne } from 'drizzle-orm';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { db } from '$lib/server/db';
import { user, account, session } from '$lib/server/auth-schema';
import { requireAuth } from '$lib/server/api';
import { auth } from '$lib/server/auth';

/**
 * Your own account, not an arbitrary one. The id comes from the session rather
 * than the request body — anything else lets a signed-in editor rename someone
 * else by changing a field in a payload.
 */
async function me() {
  const signedIn = await requireAuth(getRequestEvent().request);
  return signedIn.user.id;
}

/**
 * Signs every *other* device out.
 *
 * A password is changed for one of two reasons, and the second one is that
 * somebody else has it. Leaving their session alive means the change did
 * nothing for the case it was made for — the point of a new password is that
 * the old one stops working, and a session is the old one still working.
 *
 * The caller's own session is kept, so changing your password doesn't sign you
 * out of the screen you did it on.
 */
async function signOutOtherSessions(userId: string, keepToken?: string) {
  await db
    .delete(session)
    .where(
      keepToken
        ? and(eq(session.userId, userId), ne(session.token, keepToken))
        : eq(session.userId, userId)
    );
}

const profileSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('Name is required')),
  email: v.pipe(v.string(), v.email('Please enter a valid email'))
});

const passwordSchema = v.pipe(
  v.object({
    currentPassword: v.pipe(v.string(), v.nonEmpty('Current password is required')),
    newPassword: v.pipe(v.string(), v.minLength(8, 'New password must be at least 8 characters')),
    confirmPassword: v.pipe(v.string(), v.nonEmpty('Please confirm your password'))
  }),
  v.forward(
    v.partialCheck(
      [['newPassword'], ['confirmPassword']],
      (input) => input.newPassword === input.confirmPassword,
      'Passwords do not match'
    ),
    ['confirmPassword']
  )
);

export const updateOwnProfile = command(profileSchema, async ({ name, email }) => {
  const userId = await me();

  const taken = await db
    .select()
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, userId)))
    .limit(1);
  if (taken.length > 0) {
    throw new Error('A user with this email already exists');
  }

  const [updated] = await db
    .update(user)
    .set({ name, email })
    .where(eq(user.id, userId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update profile');
  }

  return { success: true, user: updated };
});

export const changeOwnPassword = command(
  passwordSchema,
  async ({ currentPassword, newPassword }) => {
    const userId = await me();

    const [credentials] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .limit(1);

    // Returned rather than thrown: a remote command's error message doesn't
    // reach the browser, and "something went wrong" can't tell you that you
    // simply mistyped the password you already know.
    if (!credentials?.password) {
      return { success: false as const, reason: 'No password is set for this account' };
    }

    const isValid = await verifyPassword({
      hash: credentials.password,
      password: currentPassword
    });
    if (!isValid) {
      return { success: false as const, reason: 'Current password is incorrect' };
    }

    await db
      .update(account)
      .set({ password: await hashPassword(newPassword) })
      .where(eq(account.id, credentials.id));

    const current = await auth.api.getSession({ headers: getRequestEvent().request.headers });
    await signOutOtherSessions(userId, current?.session?.token);

    return { success: true as const };
  }
);
