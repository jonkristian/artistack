import type { OverviewStats, PageViewStats, LinkClickStats } from './analytics';
import type { SocialStats } from './social-stats';
import { db } from './db';
import { settings } from './schema';
import { eq } from 'drizzle-orm';

export interface DiscordReportData {
  title: string;
  overview: OverviewStats;
  pageViews: PageViewStats;
  linkClicks: LinkClickStats;
  socialStats?: SocialStats;
  isTest?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

// Format number with K/M suffixes
function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

// Format percent change with emoji
function formatChange(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? '📈 +100%' : '➡️ 0%';
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change > 0) return `📈 +${change}%`;
  if (change < 0) return `📉 ${change}%`;
  return '➡️ 0%';
}

export function buildStatsEmbed(data: DiscordReportData): DiscordEmbed {
  const { overview, pageViews, linkClicks, socialStats, isTest } = data;

  const fields: DiscordEmbed['fields'] = [];

  // Overview stats
  fields.push({
    name: '📊 Page Views',
    value: `**${formatNumber(overview.monthViews)}** (30 days)\n${formatNumber(overview.weekViews)} this week`,
    inline: true
  });

  fields.push({
    name: '🔗 Link Clicks',
    value: `**${formatNumber(overview.monthClicks)}** (30 days)\n${formatNumber(overview.weekClicks)} this week`,
    inline: true
  });

  // Top referrer
  if (overview.topReferrer) {
    fields.push({
      name: '🌐 Top Referrer',
      value: overview.topReferrer,
      inline: true
    });
  }

  // Top clicked link
  if (overview.topLink) {
    fields.push({
      name: '⭐ Most Clicked',
      value: `${overview.topLink.label || overview.topLink.platform} (${overview.topLink.clicks} clicks)`,
      inline: true
    });
  }

  // Top referrers breakdown
  if (pageViews.viewsByReferrer.length > 0) {
    const topRefs = pageViews.viewsByReferrer
      .slice(0, 5)
      .map((r) => `• ${r.referrer}: ${r.count}`)
      .join('\n');
    fields.push({
      name: '📍 Top Sources',
      value: topRefs,
      inline: false
    });
  }

  // Top countries
  if (pageViews.viewsByCountry.length > 0) {
    const topCountries = pageViews.viewsByCountry
      .slice(0, 5)
      .map((c) => `• ${c.country}: ${c.count}`)
      .join('\n');
    fields.push({
      name: '🌍 Top Countries',
      value: topCountries,
      inline: true
    });
  }

  // Top links
  if (linkClicks.clicksByLink.length > 0) {
    const topLinks = linkClicks.clicksByLink
      .slice(0, 5)
      .map((l) => `• ${l.label || l.platform}: ${l.count}`)
      .join('\n');
    fields.push({
      name: '🔝 Top Links',
      value: topLinks,
      inline: true
    });
  }

  // Spotify stats
  if (socialStats?.spotify) {
    const spotify = socialStats.spotify;
    let value = `**${formatNumber(spotify.followers)}** followers\nPopularity: ${spotify.popularity}/100`;
    if (spotify.topTracks && spotify.topTracks.length > 0) {
      const tracks = spotify.topTracks
        .slice(0, 3)
        .map((t) => `• ${t.name}`)
        .join('\n');
      value += `\n\n**Top Tracks:**\n${tracks}`;
    }
    fields.push({
      name: '🎵 Spotify',
      value,
      inline: false
    });
  }

  // YouTube stats
  if (socialStats?.youtube) {
    const youtube = socialStats.youtube;
    let value = `**${formatNumber(youtube.subscriberCount)}** subscribers\n${formatNumber(youtube.viewCount)} total views\n${youtube.videoCount} videos`;
    if (youtube.recentVideos && youtube.recentVideos.length > 0) {
      const videos = youtube.recentVideos
        .slice(0, 3)
        .map((v) => `• ${v.title} (${formatNumber(v.viewCount)})`)
        .join('\n');
      value += `\n\n**Recent Videos:**\n${videos}`;
    }
    fields.push({
      name: '📺 YouTube',
      value,
      inline: false
    });
  }

  return {
    title: isTest ? '🧪 Test Stats Report' : `📈 ${data.title}`,
    description: isTest
      ? 'This is a test message to verify your webhook is working correctly.'
      : `Stats report for the past ${data.title.includes('Daily') ? 'day' : data.title.includes('Weekly') ? 'week' : 'month'}.`,
    color: 0x8b5cf6, // Purple accent color
    fields,
    footer: {
      text: 'Artistack Stats'
    },
    timestamp: new Date().toISOString()
  };
}

export async function sendDiscordReport(
  webhookUrl: string,
  data: DiscordReportData
): Promise<{ success: boolean; error?: string }> {
  const embed = buildStatsEmbed(data);

  const payload: DiscordWebhookPayload = {
    username: 'Artistack Stats',
    embeds: [embed]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Discord webhook error:', response.status, text);
      return {
        success: false,
        error: `Discord returned status ${response.status}`
      };
    }

    return { success: true };
  } catch (e) {
    console.error('Discord webhook fetch error:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error'
    };
  }
}

// Scheduled report sender (to be called by a cron job or scheduler)
export async function sendScheduledReport(profileData: {
  discordWebhookUrl: string | null;
  discordEnabled: boolean | null;
  discordSchedule: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!profileData.discordWebhookUrl || !profileData.discordEnabled) {
    return { success: false, error: 'Discord not configured or disabled' };
  }

  // Import analytics and social stats dynamically to avoid circular imports
  const { getOverviewStats, getPageViewStats, getLinkClickStats } = await import('./analytics');
  const { getCachedSocialStats } = await import('./social-stats');

  const days =
    profileData.discordSchedule === 'daily' ? 1 : profileData.discordSchedule === 'weekly' ? 7 : 30;

  const [overview, pageViews, linkClicks, socialStats] = await Promise.all([
    getOverviewStats(),
    getPageViewStats(days),
    getLinkClickStats(days),
    getCachedSocialStats()
  ]);

  const title =
    profileData.discordSchedule === 'daily'
      ? 'Daily Stats Report'
      : profileData.discordSchedule === 'weekly'
        ? 'Weekly Stats Report'
        : 'Monthly Stats Report';

  return sendDiscordReport(profileData.discordWebhookUrl, {
    title,
    overview,
    pageViews,
    linkClicks,
    socialStats
  });
}

/**
 * Send scheduled Discord report (called by scheduler)
 * Gets profile from DB, sends report, updates lastSent timestamp
 */
export async function sendScheduledDiscordReport(): Promise<{ success: boolean; error?: string }> {
  const [settingsData] = await db.select().from(settings).limit(1);

  if (!settingsData?.discordWebhookUrl || !settingsData.discordEnabled) {
    return { success: false, error: 'Discord not configured or disabled' };
  }

  const result = await sendScheduledReport(settingsData);

  if (result.success) {
    // Update lastSent timestamp
    await db
      .update(settings)
      .set({ discordLastSent: new Date() })
      .where(eq(settings.id, settingsData.id));
  }

  return result;
}
