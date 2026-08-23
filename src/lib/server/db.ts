import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema';
import * as authSchema from './auth-schema';

// Same variable the migration runner reads, so the two can never disagree
// about which file they are operating on.
const DB_PATH = process.env.DATABASE_PATH ?? 'data/artistack.db';

/*
 * Created if absent, because this module is imported — and therefore run — by
 * SvelteKit's postbuild analyse step, inside a build container that has no
 * data/ directory. better-sqlite3 does not create parent directories, so the
 * build died with "Cannot open database because the directory does not exist".
 * At runtime the persistent volume supplies this path instead.
 */
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);

/*
 * Tuned for `data/` living on a network-attached volume, where an fsync costs
 * far more than it does on local NVMe.
 *
 * WAL replaces the default rollback journal, which created and deleted a
 * journal file around every write — several fsyncs per commit. It also stops
 * readers blocking the writer, which matters here because a render job writes
 * progress while the admin page is polling it.
 *
 * synchronous=NORMAL fsyncs at checkpoints rather than every commit. With WAL
 * that risks losing only the last transaction, and only to an OS or power
 * failure — an application crash is still safe. FULL buys durability this app
 * doesn't need at a cost network storage makes real.
 *
 * busy_timeout stops a concurrent writer failing outright with SQLITE_BUSY;
 * it waits for the lock instead.
 */
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } });
