import * as v from 'valibot';
import { command, getRequestEvent } from '$app/server';
import { and, eq, ne } from 'drizzle-orm';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { db } from '$lib/server/db';
import { user, account } from '$lib/server/auth-schema';
import { requireAuth } from '$lib/server/api';

/**
 * Your own account, not an arbitrary one. The id comes from the session rather
 * than the request body — anything else lets a signed-in editor rename someone
 * else by changing a field in a payload.
 */
async function me() {
  const session = await requireAuth(getRequestEvent().request);
  return session.user.id;
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

    return { success: true as const };
  }
);
