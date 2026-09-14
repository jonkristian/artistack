import { json } from '@sveltejs/kit';
import { addSubscriber } from '$lib/server/subscribers';
import { sendWelcomeEmail } from '$lib/server/emails';
import { isBot, getClientIP, lookupCountry } from '$lib/server/tracking';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';
import { getSettings } from '$lib/server/settings';

/**
 * Public sign-up for the fan list.
 *
 * Unauthenticated by necessity — the whole point is that a stranger who likes a
 * song can leave an address. That shapes the defences: a honeypot rather than a
 * captcha, the shared bot filter, and replies that say the same thing whether
 * or not the address was already on the list, so this can't be used to ask
 * whether someone is a subscriber.
 */
export const POST: RequestHandler = async (event) => {
  const { request, url } = event;
  const siteSettings = await getSettings();
  if (!siteSettings?.subscribersEnabled) {
    return json({ success: false, message: 'Not accepting sign-ups.' }, { status: 404 });
  }

  let body: { email?: unknown; name?: unknown; source?: unknown; website?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: 'Could not read that.' }, { status: 400 });
  }

  // Honeypot: a field the form hides and a person never fills. Answer as though
  // it worked, so a bot gets no signal to tune against.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ success: true });
  }

  if (isBot(request.headers.get('user-agent') || '')) {
    return json({ success: true });
  }

  /*
   * Ten an hour from one address, which is more than a queue at a merch table
   * will ever produce and far less than a script is after.
   *
   * Said plainly rather than answered with a quiet success, unlike the honeypot
   * above: a person behind a shared connection needs to know their sign-up
   * didn't happen, and a script that has been throttled learns nothing it can't
   * already see from the clock.
   */
  const ip = getClientIP(event);
  const limit = rateLimit(`subscribe:${ip ?? 'unknown'}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return json(
      { success: false, message: 'Too many sign-ups from here. Try again in a little while.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Deliberately loose. Anything stricter rejects addresses that genuinely
  // work, and the only test that settles it is sending mail to it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ success: false, message: 'That address looks wrong.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) || null : null;
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 120) || null : null;

  const country = ip ? await lookupCountry(ip) : null;

  const { token, joined } = await addSubscriber({
    email,
    name,
    source,
    country,
    // A sign-up form is somebody asking, which outranks an old refusal.
    revivesUnsubscribed: true
  });

  /*
   * The welcome, and only for someone who has actually just joined — a second
   * one to an address already on the list says the list has lost count.
   *
   * Awaited but never fatal. A list that grew and an email that didn't send is
   * a smaller problem than telling a stranger their sign-up failed when it
   * didn't, and the reply says the same thing either way — including for the
   * honeypot and bot paths above, which never reach here at all.
   */
  if (joined && token) {
    try {
      await sendWelcomeEmail(email, token, url.origin);
    } catch (err) {
      console.error('[subscribe] could not send the welcome email', err);
    }
  }

  return json({ success: true });
};
