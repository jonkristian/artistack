import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { clipProjects, profile, settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { getValidSession } from '$lib/server/upload-session';
import { videoSupported } from '$lib/server/ffmpeg';
import type { PageServerLoad } from './$types';
import { getSettings } from '$lib/server/settings';

/**
 * The page a phone lands on after scanning an upload QR.
 *
 * Deliberately thin: it knows the token is valid, what the upload is for, and
 * nothing else. It never lists the media library — the capability is "add a
 * file", so this page can't be turned into a window onto everything else.
 */
export const load: PageServerLoad = async ({ params }) => {
  const session = await getValidSession(params.token);

  // An expired QR is the common case here — someone scans one from yesterday —
  // so it gets a message that says what to do, not a bare 404.
  if (!session) {
    throw error(410, 'This upload link has expired. Ask for a new QR code.');
  }

  const [profileData] = await db.select().from(profile).limit(1);
  const settingsData = await getSettings();

  let projectName: string | null = null;
  if (session.projectId) {
    const [project] = await db
      .select({ name: clipProjects.name })
      .from(clipProjects)
      .where(eq(clipProjects.id, session.projectId))
      .limit(1);
    projectName = project?.name ?? null;
  }

  return {
    token: params.token,
    label: session.label,
    projectName,
    expiresAt: session.expiresAt,
    uploadCount: session.uploadCount,
    artistName: profileData?.name ?? settingsData?.siteTitle ?? 'Artist',
    accentColor: settingsData?.colorAccent ?? '#8b5cf6',
    // Without ffmpeg the server can't accept video at all, which is worth
    // saying before someone waits out a 400MB upload.
    videoAccepted: await videoSupported()
  };
};
