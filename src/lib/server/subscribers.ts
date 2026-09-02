import { db } from './db';
import { subscribers } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Adding someone to the fan list.
 *
 * One place, because there are two ways onto the list and they arrive under
 * different law. A sign-up form is consent: somebody asked. A checkout is not —
 * it's the existing-customer exemption in markedsføringsloven § 15, which lets
 * a seller mail a buyer about similar goods provided they were given a plain
 * chance to decline when the address was taken, and in every message after.
 *
 * The difference is recorded in `source`, so a list can be told apart later. If
 * anyone ever has to show why an address is on it, "they ticked a box on a
 * release page" and "they bought a t-shirt" are different answers.
 */
export async function addSubscriber(input: {
  email: string;
  name?: string | null;
  source?: string | null;
  country?: string | null;
  /**
   * Whether this may bring back an address that previously opted out.
   *
   * True for a sign-up form — asking again is a fresh consent and outranks an
   * old refusal. False for a purchase: buying a record is not a request to be
   * mailed, and quietly re-adding someone who once unsubscribed is the way a
   * list stops being trusted, whatever the law allows.
   */
  revivesUnsubscribed: boolean;
  /**
   * The unsubscribe token, when the address is on the list and active — whether
   * it was just added or was already there. Null when it isn't, which is the
   * case for someone who opted out before and hasn't asked to come back.
   *
   * Returned so a receipt can say "you're on the list" and give the way off it
   * in the same breath.
   */
}): Promise<string | null> {
  const email = input.email.trim().toLowerCase();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1);

  if (existing) {
    if (existing.unsubscribedAt && input.revivesUnsubscribed) {
      await db
        .update(subscribers)
        .set({
          unsubscribedAt: null,
          consentAt: now,
          source: input.source ?? null,
          country: input.country ?? null
        })
        .where(eq(subscribers.id, existing.id));
      return existing.token;
    }

    // Already on the list, or off it and staying off. Nothing to write either
    // way; the token comes back only for someone actually on it.
    return existing.unsubscribedAt ? null : existing.token;
  }

  const token = crypto.randomUUID();
  await db.insert(subscribers).values({
    email,
    name: input.name ?? null,
    source: input.source ?? null,
    country: input.country ?? null,
    consentAt: now,
    token
  });

  return token;
}
