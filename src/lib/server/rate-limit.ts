/**
 * A fixed window per key, counted in memory.
 *
 * For endpoints a stranger can reach, where the cost of an abusive caller is
 * paid by someone else — the fan list sign-up sends mail to whatever address
 * it's given, so left open it is a way to have this server deliver a stranger's
 * spam under your own domain and burn the sender reputation it goes out on.
 *
 * In memory on purpose. This app runs as one Node process, so a Map is the
 * whole of what a database table would give and none of the writes; a restart
 * forgives everyone, which for a limit measured in an hour is not worth a
 * schema. If it ever runs as two processes, each keeps its own count and the
 * effective limit doubles — worth knowing before that day rather than after.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/**
 * Expired entries are swept when the map has grown enough to be worth it,
 * rather than on a timer: a site nobody is visiting shouldn't wake up to tidy
 * an empty room.
 */
function prune(now: number) {
  if (windows.size < 500) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  prune(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
}
