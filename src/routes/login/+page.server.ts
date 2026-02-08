import { db } from '$lib/server/db';
import { user, account } from '$lib/server/auth-schema';
import { hashPassword } from 'better-auth/crypto';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
  const users = await db.select({ id: user.id }).from(user).limit(1);
  return {
    allowSignUp: users.length === 0
  };
};

export const actions: Actions = {
  setup: async ({ request }) => {
    // Check if any users exist
    const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
    if (existingUsers.length > 0) {
      return fail(400, { error: 'Setup already completed' });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters' });
    }

    try {
      const userId = crypto.randomUUID();
      const hashedPassword = await hashPassword(password);

      // Create admin user
      await db.insert(user).values({
        id: userId,
        name: name || 'Admin',
        email,
        emailVerified: true,
        role: 'admin'
      });

      // Create credential account
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId: userId,
        password: hashedPassword,
        updatedAt: new Date()
      });

      return { success: true };
    } catch (e) {
      return fail(500, { error: 'Failed to create account' });
    }
  }
};
