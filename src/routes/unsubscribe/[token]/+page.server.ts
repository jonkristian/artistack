import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { subscribers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

/**
 * One-click unsubscribe.
 *
 * No login and no confirmation step: someone who gave an address to hear about
 * a record should not have to prove who they are to stop hearing about it, and
 * a link that needs a second click is a link that gets reported as spam
 * instead. The token is the only thing that identifies them, so it identifies
 * nothing else.
 */
export const load: PageServerLoad = async ({ params }) => {
  const [subscriber] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.token, params.token))
    .limit(1);

  if (!subscriber) {
    error(404, 'That link is no longer valid.');
  }

  if (!subscriber.unsubscribedAt) {
    await db
      .update(subscribers)
      .set({ unsubscribedAt: new Date() })
      .where(eq(subscribers.id, subscriber.id));
  }

  return { email: subscriber.email };
};
