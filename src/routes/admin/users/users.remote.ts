import * as v from 'valibot';
import { form, command } from '$app/server';
import { db } from '$lib/server/db';
import { user, account } from '$lib/server/auth-schema';
import { eq, ne, and } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createInvite, inviteUrl, sendInviteEmail } from '$lib/server/invites';
import { requireAdmin } from '$lib/server/guards';

// ============================================================================
// Validation Schemas
// ============================================================================

const inviteUserSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty('Name is required')),
  email: v.pipe(v.string(), v.email('Please enter a valid email')),
  role: v.optional(v.picklist(['admin', 'editor'])),
  origin: v.optional(v.string())
});

const resendInviteSchema = v.object({
  userId: v.string(),
  origin: v.optional(v.string())
});

const updateUserSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.pipe(v.string(), v.email('Please enter a valid email'))),
  role: v.optional(v.picklist(['admin', 'editor']))
});

const deleteUserSchema = v.object({
  id: v.string()
});

const resetPasswordSchema = v.pipe(
  v.object({
    userId: v.string(),
    newPassword: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters')),
    confirmPassword: v.pipe(v.string(), v.nonEmpty('Please confirm the password'))
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

// ============================================================================
// User Management Commands
//
// Every one of these checks for itself. The page guard on /admin/users doesn't
// run when the browser calls a command directly, so it protects the page and
// nothing else.
// ============================================================================

/**
 * Invites someone instead of setting a password on their behalf. An admin
 * choosing another person's password means it travels over whatever channel
 * they use to pass it on, and it's a password the owner didn't choose — so the
 * row is created without a credential account and the invite link is what
 * turns it into an account.
 */
export const inviteUser = form(inviteUserSchema, async ({ name, email, role, origin }) => {
  const admin = await requireAdmin();

  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error('A user with this email already exists');
  }

  const userId = crypto.randomUUID();
  const [newUser] = await db
    .insert(user)
    .values({
      id: userId,
      name,
      email,
      // The invite link is itself proof they read the address it was sent to.
      emailVerified: true,
      role: role || 'editor'
    })
    .returning();

  const token = await createInvite(userId, admin.id);
  const url = inviteUrl(token, origin);
  const sent = await sendInviteEmail(email, name, url);

  // Hand back the link when mail fails: the invite is valid either way, and an
  // admin who can copy it is better off than one staring at an error.
  return { success: true, user: newUser, emailed: sent.success, error: sent.error, url };
});

/** Issues a fresh link, invalidating the old one. */
export const resendInvite = command(resendInviteSchema, async ({ userId, origin }) => {
  const admin = await requireAdmin();

  const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!target) {
    throw new Error('User not found');
  }

  const token = await createInvite(userId, admin.id);
  const url = inviteUrl(token, origin);
  const sent = await sendInviteEmail(target.email, target.name, url);

  return { success: true, emailed: sent.success, error: sent.error, url };
});

export const updateUser = command(updateUserSchema, async ({ id, name, email, role }) => {
  await requireAdmin();

  const updateData: Record<string, unknown> = {};

  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;

  if (Object.keys(updateData).length === 0) {
    throw new Error('No fields to update');
  }

  // Check if email is being changed and if it's already taken
  if (email) {
    const existing = await db
      .select()
      .from(user)
      .where(and(eq(user.email, email), ne(user.id, id)))
      .limit(1);
    if (existing.length > 0) {
      throw new Error('A user with this email already exists');
    }
  }

  const [updated] = await db.update(user).set(updateData).where(eq(user.id, id)).returning();

  if (!updated) {
    throw new Error('User not found');
  }

  return { success: true, user: updated };
});

export const deleteUser = command(deleteUserSchema, async ({ id }) => {
  const admin = await requireAdmin();

  if (id === admin.id) {
    throw new Error('You cannot delete your own account');
  }

  // Delete user (sessions and accounts will cascade)
  const [deleted] = await db.delete(user).where(eq(user.id, id)).returning();

  if (!deleted) {
    throw new Error('User not found');
  }

  return { success: true };
});

export const resetPassword = command(resetPasswordSchema, async ({ userId, newPassword }) => {
  await requireAdmin();

  // Get the credential account for the target user
  const [userAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1);

  if (!userAccount) {
    throw new Error('User account not found');
  }

  // Hash and update new password
  const hashedPassword = await hashPassword(newPassword);
  await db.update(account).set({ password: hashedPassword }).where(eq(account.id, userAccount.id));

  return { success: true };
});
