import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const filePath = 'data/favicon.ico';

	if (!existsSync(filePath)) {
		throw error(404, 'Favicon not generated yet');
	}

	const file = await readFile(filePath);

	return new Response(file, {
		headers: {
			'Content-Type': 'image/x-icon',
			'Cache-Control': 'public, max-age=86400'
		}
	});
};
