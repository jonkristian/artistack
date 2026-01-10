import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const body = `# Standard crawlers
User-agent: *
Allow: /
Disallow: /admin

# AI crawlers
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Amazonbot
Disallow: /

User-agent: FacebookBot
Disallow: /

Sitemap: ${url.origin}/sitemap.xml`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
