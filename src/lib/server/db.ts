import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';

// Same variable the migration runner reads, so the two can never disagree
// about which file they are operating on.
const sqlite = new Database(process.env.DATABASE_PATH ?? 'data/artistack.db');

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
