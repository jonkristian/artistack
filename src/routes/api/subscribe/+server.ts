import { json } from '@sveltejs/kit';
import { addSubscriber } from '$lib/server/subscribers';
import { isBot, getClientIP, lookupCountry } from '$lib/server/tracking';
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
export const POST: RequestHandler = async ({ request }) => {
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

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Deliberately loose. Anything stricter rejects addresses that genuinely
  // work, and the only test that settles it is sending mail to it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ success: false, message: 'That address looks wrong.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) || null : null;
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 120) || null : null;

  const ip = getClientIP(request);
  const country = ip ? await lookupCountry(ip) : null;

  await addSubscriber({
    email,
    name,
    source,
    country,
    // A sign-up form is somebody asking, which outranks an old refusal.
    revivesUnsubscribed: true
  });

  return json({ success: true });
};
