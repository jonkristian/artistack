import { createAuthClient } from 'better-auth/svelte';
import { env } from '$env/dynamic/public';

// Get base URL from environment, fallback to localhost for development
const baseURL = env.PUBLIC_ORIGIN || 'http://localhost:5173';

export const authClient = createAuthClient({
	baseURL
});
