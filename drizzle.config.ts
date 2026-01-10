import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: ['./src/lib/server/schema.ts', './src/lib/server/auth-schema.ts'],
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: 'data/artistack.db'
	}
});
