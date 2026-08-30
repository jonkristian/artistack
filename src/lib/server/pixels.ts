import { getSettings, getMetaSettings } from './settings';
import { getClientIP } from './tracking';

/**
 * Ad pixels, browser side and server side.
 *
 * The browser pixel is what advertisers hand you and what everyone recognises.
 * It's also the half that gets blocked — by extensions, by Safari, by anyone
 * who has ever installed anything. The Conversions API sends the same event
 * from here instead, where nothing can intercept it, which is the one real
 * advantage of owning the redirect rather than pointing at a hosted smart link.
 */

/** What the browser needs. Ids only — never the token. */
export interface PublicPixelConfig {
  metaPixelId: string | null;
  tiktokPixelId: string | null;
}

/**
 * Fires a conversion to Meta's Conversions API.
 *
 * Deliberately fire-and-forget and deliberately silent. This runs while
 * somebody is waiting to be sent to Spotify, so a slow or broken advertising
 * endpoint must never delay the redirect or turn it into an error page — a
 * missing conversion costs a row in a dashboard, a failed redirect costs the
 * listener.
 */
export async function sendMetaConversion(options: {
  eventName: string;
  sourceUrl: string;
  request: Request;
  /** Sent alongside the event so Meta can deduplicate against the browser pixel. */
  eventId?: string;
}): Promise<void> {
  const [site, meta] = await Promise.all([getSettings(), getMetaSettings()]);
  if (!site?.pixelsEnabled || !meta?.pixelId || !meta.capiToken) return;

  const payload = {
    data: [
      {
        event_name: options.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: options.sourceUrl,
        ...(options.eventId ? { event_id: options.eventId } : {}),
        user_data: {
          // The only two identifiers we hold. Meta hashes email and phone when
          // you send them; we send neither, so there is nothing here to hash.
          client_ip_address: getClientIP(options.request) ?? undefined,
          client_user_agent: options.request.headers.get('user-agent') ?? undefined
        }
      }
    ]
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    await fetch(
      `https://graph.facebook.com/v21.0/${meta.pixelId}/events?access_token=${encodeURIComponent(meta.capiToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);
  } catch {
    // Silent by design — see the note above.
  }
}
