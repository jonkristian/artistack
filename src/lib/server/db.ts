import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';

const sqlite = new Database('data/artistack.db');
export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } });
