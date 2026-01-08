import { db } from '$lib/server/db';
import { user } from '$lib/server/auth-schema';
import { asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const users = await db.select({
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		image: user.image,
		createdAt: user.createdAt
	}).from(user).orderBy(asc(user.name));

	return {
		users
	};
};
