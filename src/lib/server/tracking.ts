// Shared bot detection, referrer parsing, IP utilities, and geolocation
// Used by both hooks.server.ts (page views) and go/[linkId] (link clicks)

// Bot detection patterns
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
	/showyoubot/i,
	/outbrain/i,
	/pinterest/i,
	/applebot/i,
	/semrushbot/i,
	/ahrefsbot/i,
	/mj12bot/i,
	/dotbot/i,
	/petalbot/i,
	/seznambot/i,
	/archive\.org_bot/i,
	/ia_archiver/i,
	/headlesschrome/i,
	/lighthouse/i,
	/pagespeed/i,
	/gtmetrix/i,
	/uptimerobot/i,
	/uptime-kuma/i,
	/pingdom/i,
	/curl\//i,
	/go-http-client/i,
	/python\//i,
	/aiohttp/i,
	/axios/i,
	/node-fetch/i,
	/wget/i,
	/httpie/i,
	/palo alto/i,
	/cortex/i,
	/scaninfo/i,
	/masscan/i,
	/zgrab/i,
	/censys/i,
	/shodan/i,
	/nmap/i,
	/\{USER_AGENT\}/i,
	/air\.ai/i,
	/req\/v\d/i,
	/GoogleOther/i,
	/^Mozilla\/5\.0$/
];

export function isBot(userAgent: string): boolean {
	if (!userAgent) return true;
	return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Parse referrer into hostname + path (e.g. "github.com/jonkristian/artistack").
 * Self-referrals return 'direct'.
 */
export function parseReferrer(referrer: string | null, currentHost?: string): string {
	if (!referrer) return 'direct';
	try {
		const url = new URL(referrer);
		const referrerHost = url.hostname.replace(/^www\./, '');

		if (currentHost) {
			const siteHost = currentHost.replace(/^www\./, '');
			if (referrerHost === siteHost) return 'direct';
		}

		// Include path for more useful referrer data (strip trailing slash)
		const path = url.pathname.replace(/\/$/, '');
		return path && path !== '/' ? `${referrerHost}${path}` : referrerHost;
	} catch {
		return 'direct';
	}
}

export function getClientIP(request: Request): string | null {
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

// In-memory cache for IP → country lookups (avoids hitting rate limits)
const countryCache = new Map<string, { country: string | null; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function lookupCountry(ip: string): Promise<string | null> {
	if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
		return null;
	}

	// Check cache
	const cached = countryCache.get(ip);
	if (cached && cached.expires > Date.now()) {
		return cached.country;
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
			const country = data.countryCode || null;
			countryCache.set(ip, { country, expires: Date.now() + CACHE_TTL });

			// Evict old entries if cache grows too large
			if (countryCache.size > 10000) {
				const now = Date.now();
				for (const [key, val] of countryCache) {
					if (val.expires < now) countryCache.delete(key);
				}
			}

			return country;
		}
	} catch {
		// Silently fail - analytics shouldn't block requests
	}

	return null;
}
