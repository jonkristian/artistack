import { createHash, randomBytes } from 'crypto';

/**
 * Counting people instead of hits, without learning who they are.
 *
 * The problem this solves: 6000 views of the front page might be 6000 people or
 * fifty pressing refresh, and a page-view counter cannot tell you which. The
 * usual fix is a cookie, which is exactly the thing that needs a consent banner
 * in front of it.
 *
 * So: a visitor is `sha256(salt + ip + user-agent + host)`, and the salt is
 * random and thrown away at midnight. Within a day the same person hashes to
 * the same value, so a day's views can be counted as people. Across days they
 * do not, so nobody can be followed from one to the next — and once the salt is
 * gone the hash can't be tested against a guessed address either, because the
 * input that produced it no longer exists anywhere.
 *
 * That is what keeps this out of GDPR's way: no cookie, no identifier that
 * outlives the day, no stored address, and nothing that can be turned back into
 * a person. It is the same construction Plausible and Fathom use, for the same
 * reason.
 *
 * The salt lives in memory and is never written down. A restart mid-day
 * therefore starts a new one, and that day's visitors are counted twice — an
 * undercount of uniqueness in exchange for never persisting the one value that
 * would make the hashes reversible. Deploys are rare; the trade is deliberate.
 */

let salt = randomBytes(32);
let saltDay = utcDay();

/** UTC, so the rotation happens at a predictable moment wherever this runs. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The visitor token for this request, or null when there's no address to build
 * one from — which is every request until the proxy headers are configured, and
 * is why this returns null rather than hashing a constant. A hash of "no
 * address" would make every visitor look like the same person.
 */
export function visitorToken(ip: string | null, userAgent: string, host: string): string | null {
  if (!ip) return null;

  const day = utcDay();
  if (day !== saltDay) {
    salt = randomBytes(32);
    saltDay = day;
  }

  return createHash('sha256')
    .update(salt)
    .update(ip)
    .update(userAgent)
    .update(host)
    .digest('base64url')
    .slice(0, 22);
}
