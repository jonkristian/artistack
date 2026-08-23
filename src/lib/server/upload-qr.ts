import { qrSvg } from './qr';
import { localAddresses, isLoopbackHost } from './upload-session';

/**
 * Builds the QR payload for an upload session.
 *
 * The URL is derived from the origin the admin is browsing, which is right in
 * production but useless in development — a phone can't reach `localhost`. When
 * that's the case the server offers its LAN addresses instead, because it has
 * no way to know from the outside which interface the phone can actually see.
 */
export interface UploadQr {
  url: string;
  svg: string;
  /** True when the URL points at loopback and so won't work from a phone. */
  unreachable: boolean;
  /** Alternative origins to try, when the primary one is loopback. */
  alternatives: string[];
  /**
   * True when the browser origin was loopback and a LAN address was guessed.
   *
   * Worth surfacing, because the guess is about the *address*, not about
   * whether anything is listening on it — a dev server started without
   * `--host` binds to loopback only, so the QR will resolve and then refuse
   * the connection.
   */
  substituted: boolean;
}

export function buildUploadQr(token: string, origin: string): UploadQr {
  const parsed = new URL(origin);
  const unreachable = isLoopbackHost(parsed.hostname);

  const alternatives = unreachable
    ? localAddresses().map((address) => {
        const candidate = new URL(origin);
        candidate.hostname = address;
        return candidate.origin;
      })
    : [];

  // When the browser origin can't work, encode the first LAN address instead —
  // a QR nobody can scan is worse than a best guess, and the alternatives are
  // listed so the choice can be corrected.
  const substituted = unreachable && alternatives.length > 0;
  const effective = substituted ? alternatives[0] : parsed.origin;
  const url = `${effective}/u/${token}`;

  return {
    url,
    svg: qrSvg(url, { margin: 2 }),
    unreachable: unreachable && alternatives.length === 0,
    alternatives,
    substituted
  };
}
