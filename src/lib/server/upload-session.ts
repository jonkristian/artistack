import { randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import { eq, lt } from 'drizzle-orm';
import { db } from './db';
import { uploadSessions, media, clipSources, roleForMime, type UploadSession } from './schema';

/**
 * Capability tokens for uploading from a phone.
 *
 * The token is the whole authorisation: whoever holds it can add files to the
 * media library and do nothing else — no listing, no deleting, no access to the
 * admin. That's a deliberate trade. Requiring a real login on a phone would
 * defeat the point of the QR, so instead the grant is narrow, short-lived and
 * revocable, and the page it unlocks never renders anything but what that
 * device just sent.
 */

/** How long a QR stays good for, unless the caller says otherwise. */
export const DEFAULT_TTL_MINUTES = 30;

export interface CreateSessionOptions {
  label?: string | null;
  /** Bind uploads to a clip project, so phone footage lands as sources. */
  projectId?: number | null;
  ttlMinutes?: number;
}

export async function createUploadSession(
  options: CreateSessionOptions = {}
): Promise<UploadSession> {
  const ttl = Math.max(1, Math.min(options.ttlMinutes ?? DEFAULT_TTL_MINUTES, 24 * 60));

  const [session] = await db
    .insert(uploadSessions)
    .values({
      token: randomBytes(24).toString('base64url'),
      label: options.label ?? null,
      projectId: options.projectId ?? null,
      expiresAt: new Date(Date.now() + ttl * 60_000)
    })
    .returning();

  return session;
}

/**
 * Returns the session for a token, or null if it can't be used.
 * Expiry and revocation are checked here so callers can't forget to.
 */
export async function getValidSession(token: string): Promise<UploadSession | null> {
  if (!token) return null;

  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.token, token))
    .limit(1);

  if (!session) return null;
  if (session.revoked) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  return session;
}

export interface UploadedFile {
  filename: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
  originalSize?: number;
  durationMs?: number;
}

/**
 * Records a file uploaded through a session: adds it to the media library and,
 * when the session is bound to a clip project, appends it as a source.
 *
 * The admin UI registers media from the client after upload, but a phone can't
 * — it has no authenticated way to call that command — so a token upload is
 * finalised here instead, server-side, in one step.
 */
export async function finalizeSessionUpload(
  session: UploadSession,
  file: UploadedFile
): Promise<void> {
  const [row] = await db
    .insert(media)
    .values({
      filename: file.filename,
      url: file.url,
      originalUrl: file.originalUrl,
      thumbnailUrl: file.thumbnailUrl,
      mimeType: file.mimeType,
      width: file.width,
      height: file.height,
      size: file.size,
      originalSize: file.originalSize,
      durationMs: file.durationMs,
      role: roleForMime(file.mimeType)
    })
    .returning();

  // Only video becomes a clip source; a photo sent to a clip's QR still lands
  // in the library, it just isn't footage.
  if (session.projectId && file.mimeType.startsWith('video/')) {
    const existing = await db
      .select({ position: clipSources.position })
      .from(clipSources)
      .where(eq(clipSources.projectId, session.projectId));

    await db.insert(clipSources).values({
      projectId: session.projectId,
      mediaId: row.id,
      position: existing.reduce((max, s) => Math.max(max, s.position ?? 0), 0) + 1
    });
  }

  const [current] = await db
    .select({ count: uploadSessions.uploadCount })
    .from(uploadSessions)
    .where(eq(uploadSessions.id, session.id))
    .limit(1);

  await db
    .update(uploadSessions)
    .set({ uploadCount: (current?.count ?? 0) + 1, lastUploadAt: new Date() })
    .where(eq(uploadSessions.id, session.id));
}

export async function revokeSession(id: number): Promise<void> {
  await db.update(uploadSessions).set({ revoked: true }).where(eq(uploadSessions.id, id));
}

/**
 * Deletes sessions that expired a while ago.
 * Kept for a grace period so the admin can still see what a QR collected.
 */
export async function pruneExpiredSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  await db.delete(uploadSessions).where(lt(uploadSessions.expiresAt, cutoff));
}

/** Active (unexpired, unrevoked) sessions, newest first. */
export async function listActiveSessions(): Promise<UploadSession[]> {
  const rows = await db.select().from(uploadSessions).where(eq(uploadSessions.revoked, false));

  const now = Date.now();
  return rows
    .filter((s) => s.expiresAt.getTime() > now)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/**
 * LAN addresses this server is reachable at.
 *
 * The QR is built from the origin the admin is browsing, which is correct in
 * production but useless in development: a phone can't reach `localhost`. When
 * that's the case the UI offers these instead, since the server can't otherwise
 * know which of its interfaces the phone can see.
 */
export function localAddresses(): string[] {
  const found: string[] = [];

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node <18 reports `family` as a string, newer as a number.
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;
      if (isIPv4 && !address.internal) found.push(address.address);
    }
  }

  return found;
}

/** True when a host can't be reached from another device. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
