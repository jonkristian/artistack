import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { linkClicks } from '$lib/server/schema';
import type { RequestHandler } from './$types';

// Bot detection patterns
const BOT_PATTERNS = [
	/bot/i,
	/crawler/i,
	/spider/i,
	/googlebot/i,
	/bingbot/i,
	/facebookexternalhit/i,
	/twitterbot/i,
	/linkedinbot/i,
	/headlesschrome/i
];

function isBot(userAgent: string): boolean {
	if (!userAgent) return false;
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

export const POST: RequestHandler = async ({ request }) => {
	const userAgent = request.headers.get('user-agent') || '';

	// Skip bots
	if (isBot(userAgent)) {
		return json({ success: true });
	}

	try {
		const body = await request.json();
		const linkId = parseInt(body.linkId, 10);

		if (isNaN(linkId)) {
			return json({ success: false, error: 'Invalid link ID' }, { status: 400 });
		}

		// Track asynchronously - don't wait
		trackClick(linkId, request).catch(() => {
			// Silently ignore
		});

		return json({ success: true });
	} catch {
		return json({ success: false, error: 'Invalid request' }, { status: 400 });
	}
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
