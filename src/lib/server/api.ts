import { error } from '@sveltejs/kit';
import { auth } from './auth';
import { getValidSession } from './upload-session';
import type { UploadSession } from './schema';

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
 * Authorises an upload from either a logged-in admin or a phone holding a valid
 * upload token.
 *
 * The token arrives as a query parameter rather than a header because the
 * mobile page posts files directly and a query string survives every transport
 * involved. It grants nothing but the ability to add a file — the caller still
 * goes through the same validation, size caps and processing as an admin upload.
 *
 * Returns the upload session when the request was authorised by a token, so the
 * caller can record the upload against it.
 */
export async function requireUploadAccess(
  request: Request,
  url: URL
): Promise<UploadSession | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user) return null;

  const token = url.searchParams.get('upload_token');
  if (token) {
    const uploadSession = await getValidSession(token);
    if (uploadSession) return uploadSession;
    // Expired or revoked is a different problem from "never had access", and
    // the phone should be told which so it can say so.
    throw error(403, 'This upload link has expired. Ask for a new QR code.');
  }

  throw error(401, 'Unauthorized');
}

/**
 * Calculate the next position for an ordered list of items.
 */
export function getNextPosition<T extends { position?: number | null }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1;
}
