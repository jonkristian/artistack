import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { db } from '$lib/server/db';
import { account } from '$lib/server/auth-schema';
import { findValidInvite, markInviteAccepted } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const invite = await findValidInvite(params.token);

  // Spent and expired look the same on purpose: neither tells a stranger
  // whether the token was ever real.
  if (!invite) {
    return { valid: false as const };
  }

  return { valid: true as const, name: invite.name, email: invite.email };
};

export const actions: Actions = {
  default: async ({ params, request }) => {
    const invite = await findValidInvite(params.token);
    if (!invite) {
      return fail(410, { error: 'This invitation is no longer valid.' });
    }

    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');

    if (password.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters.' });
    }
    if (password !== confirmPassword) {
      return fail(400, { error: 'Passwords do not match.' });
    }

    // Upsert rather than insert: an admin may have created this person the old
    // way, or a first attempt may have died between the two writes.
    const [existing] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, invite.userId), eq(account.providerId, 'credential')))
      .limit(1);

    const hashed = await hashPassword(password);
    if (existing) {
      await db.update(account).set({ password: hashed }).where(eq(account.id, existing.id));
    } else {
      await db.insert(account).values({
        id: randomUUID(),
        accountId: invite.userId,
        providerId: 'credential',
        userId: invite.userId,
        password: hashed,
        updatedAt: new Date()
      });
    }

    await markInviteAccepted(invite.id);

    throw redirect(303, `/login?email=${encodeURIComponent(invite.email)}&welcome=1`);
  }
};
