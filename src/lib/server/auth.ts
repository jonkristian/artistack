import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import { env } from '$env/dynamic/private';

// Get trusted origins from environment, fallback to localhost for development
const trustedOrigins = env.ORIGIN ? [env.ORIGIN] : ['http://localhost:5173'];

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'sqlite'
	}),
	emailAndPassword: {
		enabled: true
	},
	trustedOrigins
});
