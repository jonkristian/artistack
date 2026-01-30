import { db } from '$lib/server/db';
import { profile } from '$lib/server/schema';
import {
	getOverviewStats,
	getPageViewStats,
	getLinkClickStats,
	getComparisonStats,
	getPreviousPeriodViewsByDay
} from '$lib/server/analytics';
import { getCachedSocialStats } from '$lib/server/social-stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Load all analytics data in parallel
	const [overview, pageViews, linkClicks, comparison, previousPeriodViews, profileData, socialStats] = await Promise.all([
		getOverviewStats(),
		getPageViewStats(30),
		getLinkClickStats(30),
		getComparisonStats(30),
		getPreviousPeriodViewsByDay(30),
		db.select().from(profile).limit(1),
		getCachedSocialStats()
	]);

	// Calculate percent changes
	const viewsChange =
		comparison.previousViews > 0
			? Math.round(((comparison.currentViews - comparison.previousViews) / comparison.previousViews) * 100)
			: comparison.currentViews > 0
				? 100
				: 0;

	const clicksChange =
		comparison.previousClicks > 0
			? Math.round(((comparison.currentClicks - comparison.previousClicks) / comparison.previousClicks) * 100)
			: comparison.currentClicks > 0
				? 100
				: 0;

	return {
		overview,
		pageViews,
		linkClicks,
		previousPeriodViews,
		viewsChange,
		clicksChange,
		profile: profileData[0] ?? null,
		socialStats
	};
};
