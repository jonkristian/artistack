import * as v from 'valibot';
import { command, query, getRequestEvent } from '$app/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '$lib/server/api';
import { db } from '$lib/server/db';
import { uploadSessions } from '$lib/server/schema';
import {
  createUploadSession,
  revokeSession,
  pruneExpiredSessions,
  DEFAULT_TTL_MINUTES
} from '$lib/server/upload-session';
import { buildUploadQr } from '$lib/server/upload-qr';

/**
 * Upload-QR commands.
 *
 * Shared between the media library and the clip studio rather than living in
 * either one's data.remote, since both offer the same "get this off a phone"
 * action and neither owns it.
 */

/** Opens an upload session and returns the QR to show. */
export const startPhoneUpload = command(
  v.object({
    origin: v.string(),
    label: v.optional(v.nullable(v.string())),
    projectId: v.optional(v.nullable(v.number())),
    ttlMinutes: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(1440)))
  }),
  async ({ origin, label, projectId, ttlMinutes }) => {
    await requireAuth(getRequestEvent().request);

    // Cheap housekeeping on a rare action, so dead sessions don't accumulate
    // and no separate cron job is needed for them.
    await pruneExpiredSessions();

    const session = await createUploadSession({
      label,
      projectId,
      ttlMinutes: ttlMinutes ?? DEFAULT_TTL_MINUTES
    });

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      ...buildUploadQr(session.token, origin)
    };
  }
);

/** Polled by the admin while the QR is on screen, to show arrivals live. */
export const phoneUploadStatus = query(v.number(), async (sessionId) => {
  await requireAuth(getRequestEvent().request);

  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  return {
    uploadCount: session.uploadCount,
    expiresAt: session.expiresAt,
    revoked: session.revoked ?? false,
    expired: session.expiresAt.getTime() < Date.now()
  };
});

export const endPhoneUpload = command(v.number(), async (sessionId) => {
  await requireAuth(getRequestEvent().request);

  await revokeSession(sessionId);
  return { success: true };
});

/** Re-encodes the QR for a different origin, when loopback was guessed wrong. */
export const requoteUploadQr = command(
  v.object({ sessionId: v.number(), origin: v.string() }),
  async ({ sessionId, origin }) => {
    await requireAuth(getRequestEvent().request);

    const [session] = await db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .limit(1);

    if (!session) return null;

    return buildUploadQr(session.token, origin);
  }
);
