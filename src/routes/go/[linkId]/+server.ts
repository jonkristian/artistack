import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { links, linkClicks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Bot detection patterns (same as hooks.server.ts)
const BOT_PATTERNS = [
	/bot/i,
	/crawler/i,
	/spider/i,
	/slurp/i,
	/googlebot/i,
	/bingbot/i,
	/yandex/i,
	/baidu/i,
	/duckduckbot/i,
	/facebookexternalhit/i,
	/twitterbot/i,
	/linkedinbot/i,
	/embedly/i,
	/quora link preview/i,
	/applebot/i,
	/headlesschrome/i
];

function isBot(userAgent: string): boolean {
	if (!userAgent) return false; // Don't block requests without user agent
	return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function parseReferrer(referrer: string | null): string {
	if (!referrer) return 'direct';
	try {
		const url = new URL(referrer);
		return url.hostname.replace(/^www\./, '');
	} catch {
		return 'direct';
	}
}

function getClientIP(request: Request): string | null {
	const headers = [
		'cf-connecting-ip',
		'x-real-ip',
		'x-forwarded-for',
		'x-client-ip',
		'true-client-ip'
	];

	for (const header of headers) {
		const value = request.headers.get(header);
		if (value) {
			const ip = value.split(',')[0].trim();
			if (ip && ip !== '::1' && ip !== '127.0.0.1') {
				return ip;
			}
		}
	}

	return null;
}

async function lookupCountry(ip: string): Promise<string | null> {
	if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
		return null;
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1000);

		const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
			signal: controller.signal
		});
		clearTimeout(timeout);

		if (response.ok) {
			const data = await response.json();
			return data.countryCode || null;
		}
	} catch {
		// Silently fail
	}

	return null;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const linkId = parseInt(params.linkId, 10);

	if (isNaN(linkId)) {
		throw error(400, 'Invalid link ID');
	}

	// Fetch the link
	const [link] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);

	if (!link) {
		throw error(404, 'Link not found');
	}

	// Track the click (fire and forget for bots, full tracking for real users)
	const userAgent = request.headers.get('user-agent') || '';

	if (!isBot(userAgent)) {
		// Track click asynchronously - don't await to avoid slowing redirect
		trackClick(linkId, request).catch(() => {
			// Silently ignore tracking errors
		});
	}

	// Redirect to the actual URL
	throw redirect(302, link.url);
};

async function trackClick(linkId: number, request: Request): Promise<void> {
	const referrer = parseReferrer(request.headers.get('referer'));
	const ip = getClientIP(request);
	const country = ip ? await lookupCountry(ip) : null;

	await db.insert(linkClicks).values({
		linkId,
		referrer,
		country
	});
}
