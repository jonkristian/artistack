import { db } from './db';
import { clipProjects, profile, settings, type ClipProject } from './schema';
import { eq } from 'drizzle-orm';
import { slugify } from '$lib/utils/slug';
import { tagsFor } from './tags';

/**
 * The post sheet: a small markdown file generated alongside every rendered clip,
 * carrying the title, tags, hashtags and caption for posting.
 *
 * Ported from The How's sidecar, with one change that only makes sense here —
 * the call-to-action is a campaign link (/c/<slug>) rather than the bare site
 * URL, so the stats page can attribute inbound traffic to the clip that drove
 * it. Generate, post, measure.
 *
 * It's plain markdown so it stays editable before posting.
 */

/** Turns a tag into a hashtag: "new music" -> "#newmusic". */
function hashtag(tag: string): string {
  const cleaned = tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');
  return cleaned ? `#${cleaned}` : '';
}

export interface PostSheet {
  markdown: string;
  /** The campaign URL the CTA points at. */
  ctaUrl: string;
  /** The caption on its own, for pasting into a platform's compose box. */
  caption: string;
  /** The hashtags as one space-separated string, in sheet order. */
  hashtags: string;
}

/**
 * Builds the post sheet for a clip project.
 * `baseUrl` should be the site's public origin.
 */
export async function buildPostSheet(projectId: number, baseUrl: string): Promise<PostSheet> {
  const [project] = await db
    .select()
    .from(clipProjects)
    .where(eq(clipProjects.id, projectId))
    .limit(1);

  if (!project) throw new Error('Clip project not found');

  const [profileData] = await db.select().from(profile).limit(1);
  const [settingsData] = await db.select().from(settings).limit(1);

  const artist = profileData?.name || settingsData?.siteTitle || 'Artist';

  // The artist name leads the tag list — it's the one tag every post should
  // carry — followed by whatever the project adds.
  const projectTags = (await tagsFor('clip', project.id)).map((t) => t.name);

  const tags = [artist, ...projectTags].filter(
    (tag, index, all) => all.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === index
  );

  const hashtags = tags.map(hashtag).filter(Boolean);

  const ctaUrl = `${baseUrl.replace(/\/$/, '')}/c/${campaignSlugFor(project)}`;

  const body = (project.description || '').trim();

  const markdown = [
    '---',
    `title: ${flatten(project.name)}`,
    `tags: ${tags.join(', ')}`,
    `hashtags: ${hashtags.join(' ')}`,
    `link: ${ctaUrl}`,
    '---',
    '',
    body,
    '',
    ctaUrl,
    ''
  ].join('\n');

  return { markdown, ctaUrl, caption: body, hashtags: hashtags.join(' ') };
}

/** Collapses a multi-line value so it stays valid on one frontmatter line. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The campaign slug a project posts under, derived from its name.
 *
 * Derived rather than stored: a stored override only pays off if you rename a
 * clip after posting, and an unknown slug still redirects to the homepage, so
 * the cost of a rename is a bit of lost attribution rather than a dead link.
 */
function campaignSlugFor(project: Pick<ClipProject, 'id' | 'name'>) {
  return slugify(project.name) || `clip-${project.id}`;
}

/**
 * The campaign link for a clip, without building the whole sheet.
 *
 * Same URL `buildPostSheet` puts in the sheet, so the link announced in Discord
 * is the one that was posted to the platforms — which is the point, since Stats
 * attributes a visit to whichever clip's `/c/` link carried it.
 */
export function campaignUrlFor(project: Pick<ClipProject, 'id' | 'name'>, baseUrl: string) {
  return `${baseUrl.replace(/\/$/, '')}/c/${campaignSlugFor(project)}`;
}
