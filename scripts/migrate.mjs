/**
 * Applies pending migrations, then hands off to the server.
 *
 * Replaces `drizzle-kit push`, which diffs the live schema against the code and
 * asks the operator when it can't tell a rename from a drop-plus-add. A deploy
 * container has no TTY, so that prompt hangs the release and the server never
 * starts. Generated migrations are decided at author time instead.
 *
 * Baselining: production predates the clips work, so its schema is exactly what
 * 0000 creates. Rather than run 0000 against tables that already exist, this
 * marks it as applied when it finds a database that already has the pre-clips
 * tables but no migrations journal. A genuinely empty database runs both.
 */
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? 'data/artistack.db';
const MIGRATIONS_DIR = 'drizzle';
const BASELINE = '0000_baseline_pre_clips.sql';

const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  created_at NUMERIC
)`);

const applied = new Set(db.prepare('select hash from __drizzle_migrations').all().map((r) => r.hash));

// A pre-clips database already contains everything 0000 would create.
const hasPreClipsTables = db
  .prepare("select count(*) c from sqlite_master where type='table' and name in ('settings','media','links','blocks')")
  .get().c === 4;

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
let ran = 0;

for (const file of files) {
  const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');
  if (applied.has(hash)) continue;

  const baselineOnExisting = file === BASELINE && hasPreClipsTables && applied.size === 0;
  if (baselineOnExisting) {
    console.log(`[migrate] baselining ${file} — schema already present`);
  } else {
    console.log(`[migrate] applying ${file}`);
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    const run = db.transaction(() => {
      for (const statement of statements) db.exec(statement);
    });
    run();
    ran++;
  }
  db.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)').run(hash, Date.now());
}

console.log(ran ? `[migrate] ${ran} migration(s) applied` : '[migrate] up to date');
db.close();
