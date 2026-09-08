import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireFeature } from '$lib/server/guards';
import { getClipSettings, getClipPublishingSettings } from '$lib/server/settings';
import { clipProjects, clipSources, clipPosts, media, settings } from '$lib/server/schema';
import { getQueue } from '$lib/server/clip-queue';
import { user } from '$lib/server/auth-schema';
import { auth } from '$lib/server/auth';
import { desc, eq, asc } from 'drizzle-orm';
import { videoSupported } from '$lib/server/ffmpeg';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
  const { settings: siteSettings } = await requireFeature(request, 'clipsEnabled');
  const [clips, publishing] = await Promise.all([getClipSettings(), getClipPublishingSettings()]);

  /*
   * Newest first, by when it was made.
   *
   * Not `updatedAt`, which sounds like the better answer and isn't: only the
   * project row's own fields bump it — the name, the tags, the captions, the
   * look — while dragging blocks, trimming, muting and adding media all write
   * to other tables and leave it alone. So "last edited" was true of some edits
   * and not others, and an afternoon spent on a clip's timeline left it sitting
   * below one you had renamed days ago.
   *
   * Fixing that the other way — touching the project on every drag — would have
   * the list rearranging itself while you work, which is worse than an order
   * that is merely arbitrary. `createdAt` never moves, and means exactly what
   * it says.
   */
  const projects = await db.select().from(clipProjects).orderBy(desc(clipProjects.createdAt));

  // Only the project/media pairing is needed here: the grid shows a poster and
  // a source count, not the full editor's worth of rows.
  const sources = await db
    .select({ projectId: clipSources.projectId })
    .from(clipSources)
    .orderBy(asc(clipSources.position));

  const allMedia = await db.select().from(media).orderBy(desc(media.createdAt));

  // Which published clips actually reached a platform. A `draft` row means the
  // file was uploaded for someone to post by hand, so it doesn't count as
  // coverage — a clip carrying only those went nowhere public.
  /*
   * Where each clip actually got to.
   *
   * The list used to ask only "did anything report this as live", which answers
   * a question about failure and none about success: a clip on three platforms
   * and a clip on one looked identical, and neither said which. The rows are
   * small — one per platform per clip — so the whole set comes back and the
   * page groups it.
   */
  const postRows = await db
    .select({
      projectId: clipPosts.projectId,
      platform: clipPosts.platform,
      status: clipPosts.status
    })
    .from(clipPosts);

  const posts: Record<number, { platform: string; status: string }[]> = {};
  for (const row of postRows) {
    (posts[row.projectId] ??= []).push({ platform: row.platform, status: row.status });
  }

  return {
    posts,
    projects,
    sources,
    media: allMedia,
    queue: await getQueue(),
    renderingAvailable: await videoSupported(),
    publishConfigured: Boolean(publishing?.publishWebhookUrl)
  };
};
