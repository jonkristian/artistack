import { error } from '@sveltejs/kit';
import { auth } from './auth';

/**
 * Requires authentication for API routes.
 * Throws 401 if user is not authenticated.
 */
export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw error(401, 'Unauthorized');
  }
  return session;
}

/**
 * Calculate the next position for an ordered list of items.
 */
export function getNextPosition<T extends { position?: number | null }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1;
}
