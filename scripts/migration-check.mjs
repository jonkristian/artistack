/**
 * Before-and-after check for a production migration.
 *
 * `scripts/migrate.mjs` already applies pending migrations in order and wraps
 * each one in a transaction, so nothing can half-apply. What it can't tell you
 * is whether the result is *right* — several of these migrations move data
 * between tables, and a move that silently produces nothing looks identical to
 * a move that had nothing to do.
 *
 * So: snapshot the things that must survive, migrate, then check they did.
 *
 *   node scripts/migration-check.mjs before   # backs up, records a snapshot
 *   npm start                                 # or however you deploy
 *   node scripts/migration-check.mjs after    # compares against the snapshot
 *
 * Secrets are recorded as a length and a SHA-256 prefix, never in full, so the
 * snapshot file is safe to leave on the server and paste into a terminal.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? 'data/artistack.db';
const SNAPSHOT_PATH = `${DB_PATH}.migration-snapshot.json`;
const mode = process.argv[2];

if (!['before', 'after'].includes(mode)) {
  console.error('Usage: node scripts/migration-check.mjs before|after');
  process.exit(1);
}

if (!existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: mode === 'after' });

/** A value we can compare without storing it. */
function fingerprint(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return { len: text.length, sha: createHash('sha256').update(text).digest('hex').slice(0, 12) };
}

function tableExists(name) {
  return !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name);
}

function columns(table) {
  if (!tableExists(table)) return [];
  return db
    .prepare(`pragma table_info(${table})`)
    .all()
    .map((r) => r.name);
}

function one(sql) {
  try {
    return db.prepare(sql).get();
  } catch {
    return null;
  }
}

function count(table) {
  if (!tableExists(table)) return null;
  return db.prepare(`select count(*) c from ${table}`).get().c;
}

/**
 * The credentials that move house during 0017 and 0019, wherever they currently
 * live. Recorded before, looked for after.
 */
function credentials() {
  const out = {};
  const settingsCols = columns('settings');

  const fromSettings = (col) =>
    settingsCols.includes(col) ? one(`select ${col} v from settings limit 1`)?.v : undefined;

  // Pre-split locations
  out.smtpPassword = fingerprint(fromSettings('smtp_password'));
  out.discordWebhookUrl = fingerprint(fromSettings('discord_webhook_url'));
  out.publishSecret = fingerprint(fromSettings('publish_secret'));
  out.publishWebhookUrl = fingerprint(fromSettings('publish_webhook_url'));

  // Post-split locations take precedence when they exist
  if (tableExists('mail_settings')) {
    out.smtpPassword = fingerprint(one('select smtp_password v from mail_settings limit 1')?.v);
  }
  if (tableExists('discord_settings')) {
    out.discordWebhookUrl = fingerprint(
      one('select webhook_url v from discord_settings limit 1')?.v
    );
  }
  if (tableExists('clip_settings')) {
    out.publishSecret = fingerprint(one('select publish_secret v from clip_settings limit 1')?.v);
    out.publishWebhookUrl = fingerprint(
      one('select publish_webhook_url v from clip_settings limit 1')?.v
    );
  }

  // The Google key lives in three places across this range of migrations:
  // integrations.config JSON, then settings.google_api_key, then provider_settings.
  let googleKey;
  if (tableExists('provider_settings')) {
    googleKey = one('select google_api_key v from provider_settings limit 1')?.v;
  } else if (settingsCols.includes('google_api_key')) {
    googleKey = fromSettings('google_api_key');
  } else if (columns('integrations').includes('config')) {
    const row = one("select config c from integrations where provider='google'");
    try {
      googleKey = row?.c ? JSON.parse(row.c).apiKey : undefined;
    } catch {
      googleKey = undefined;
    }
  }
  out.googleApiKey = fingerprint(googleKey);

  return out;
}

function snapshot() {
  const applied = tableExists('__drizzle_migrations')
    ? db.prepare('select count(*) c from __drizzle_migrations').get().c
    : 0;

  return {
    takenAt: new Date().toISOString(),
    appliedMigrations: applied,
    counts: {
      profile: count('profile'),
      blocks: count('blocks'),
      links: count('links'),
      tourDates: count('tour_dates'),
      media: count('media'),
      pageViews: count('page_views'),
      linkClicks: count('link_clicks'),
      clipProjects: count('clip_projects'),
      products: count('products')
    },
    credentials: credentials()
  };
}

if (mode === 'before') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${DB_PATH}.bak-${stamp}`;
  copyFileSync(DB_PATH, backup);

  const state = snapshot();
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(state, null, 2));

  const files = readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const appliedHashes = tableExists('__drizzle_migrations')
    ? new Set(
        db
          .prepare('select hash from __drizzle_migrations')
          .all()
          .map((r) => r.hash)
      )
    : new Set();

  const pending = files.filter((f) => {
    const hash = createHash('sha256')
      .update(readFileSync(`drizzle/${f}`, 'utf8'))
      .digest('hex');
    return !appliedHashes.has(hash);
  });

  console.log(`Backup:   ${backup}`);
  console.log(`Snapshot: ${SNAPSHOT_PATH}`);
  console.log(`\nPending migrations (${pending.length}):`);
  for (const f of pending) console.log(`  ${f}`);
  console.log('\nRows that must survive:');
  for (const [k, v] of Object.entries(state.counts)) {
    if (v !== null) console.log(`  ${k.padEnd(14)} ${v}`);
  }
  console.log('\nCredentials present:');
  for (const [k, v] of Object.entries(state.credentials)) {
    console.log(`  ${k.padEnd(20)} ${v ? `set (${v.len} chars)` : '—'}`);
  }
  console.log('\nNow deploy, then run: node scripts/migration-check.mjs after');
} else {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`No snapshot at ${SNAPSHOT_PATH}. Did you run "before" on this machine?`);
    process.exit(1);
  }

  const before = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const after = snapshot();
  const problems = [];

  for (const [key, was] of Object.entries(before.counts)) {
    const now = after.counts[key];
    if (was === null) continue;
    if (now === null) problems.push(`${key}: table is gone (had ${was} rows)`);
    else if (now < was) problems.push(`${key}: ${was} rows before, ${now} after`);
  }

  for (const [key, was] of Object.entries(before.credentials)) {
    const now = after.credentials[key];
    if (!was) continue;
    if (!now) problems.push(`${key}: was set before, missing after`);
    else if (now.sha !== was.sha) problems.push(`${key}: value changed during migration`);
  }

  // The split's whole point: no credential left in the table the public reads.
  const leaked = [
    'smtp_password',
    'publish_secret',
    'discord_webhook_url',
    'google_api_key'
  ].filter((c) => columns('settings').includes(c));
  if (leaked.length) problems.push(`settings still has credential columns: ${leaked.join(', ')}`);

  console.log(`Migrations applied: ${before.appliedMigrations} → ${after.appliedMigrations}\n`);

  if (problems.length === 0) {
    console.log('All checks passed.');
    console.log('  row counts held or grew');
    console.log('  every credential that was set is still set, unchanged');
    console.log('  no credential columns remain on `settings`');
  } else {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ${p}`);
    console.log('\nThe backup from the "before" run is beside the database.');
    process.exitCode = 1;
  }
}

db.close();
