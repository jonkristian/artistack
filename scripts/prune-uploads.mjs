/**
 * Finds files in the uploads directory that nothing points at, and optionally
 * removes them.
 *
 * These accumulated because a cropped image used to be written straight to
 * disk with no `media` row — so deleting the original left the crop behind,
 * and replacing a cover orphaned the one before it. Crops are rows now, which
 * stops it happening again; this clears what's already there.
 *
 * Reports by default and deletes nothing. Pass --delete to act.
 *
 *   node scripts/prune-uploads.mjs
 *   node scripts/prune-uploads.mjs --delete
 */
import { readdir, stat, unlink } from 'fs/promises';
import { join, basename } from 'path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? 'data/artistack.db';
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'data/uploads';
const doDelete = process.argv.includes('--delete');

const db = new Database(DB_PATH, { readonly: !doDelete });

/*
 * Every text column of every table is scanned for something that looks like an
 * upload path.
 *
 * This was a hand-written list of columns, and it was wrong: it missed
 * `blocks.config`, where an image block keeps its `imageUrl` and a gallery its
 * media ids — so running it would have deleted pictures that were on the front
 * page. A list you have to remember to update is the wrong shape for something
 * that deletes files. Scanning everything is slower and cannot miss a column.
 */
const UPLOAD_REF = /\/uploads\/([^"'\\\s)]+)/g;

const referenced = new Set();

const tables = db
  .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
  .all()
  .map((r) => r.name);

for (const table of tables) {
  const columns = db
    .prepare(`pragma table_info(${table})`)
    .all()
    .filter((c) => !/^(integer|real|blob)$/i.test(c.type))
    .map((c) => c.name);

  if (!columns.length) continue;

  const rows = db.prepare(`select ${columns.map((c) => `"${c}"`).join(', ')} from ${table}`).all();
  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(UPLOAD_REF)) {
        referenced.add(match[1]);
      }
    }
  }
}

/*
 * Files with fixed names that no row points at, because nothing needs to: the
 * press kit is generated to one path and linked from the themes as a literal.
 * Without this it reads as orphaned and gets deleted out from under a public
 * download link.
 */
const KEEP = new Set(['press-kit.zip']);

/*
 * Crops that nothing uses.
 *
 * Every Apply writes a new crop and abandons the last one, so iterating on a
 * crop leaves a trail of rows whose files are referenced only by the row
 * itself. They're skipped by the scan above for exactly that reason — a media
 * row always mentions its own file — so they're found here instead, by asking
 * whether anything *else* points at them.
 */
const cropRows = db
  .prepare("select id, url, original_url, thumbnail_url from media where role = 'crop'")
  .all();

const usedByContent = new Set();
for (const table of tables) {
  if (table === 'media') continue;
  const columns = db
    .prepare(`pragma table_info(${table})`)
    .all()
    .filter((c) => !/^(integer|real|blob)$/i.test(c.type))
    .map((c) => c.name);
  if (!columns.length) continue;

  for (const row of db
    .prepare(`select ${columns.map((c) => `"${c}"`).join(', ')} from ${table}`)
    .all()) {
    for (const value of Object.values(row)) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(UPLOAD_REF)) usedByContent.add(match[1]);
    }
  }
}

const deadCrops = cropRows.filter((c) => !usedByContent.has(basename(c.url)));

const entries = await readdir(UPLOAD_DIR, { withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => e.name);
const orphans = files.filter((f) => !referenced.has(f) && !KEEP.has(f)).sort();

let bytes = 0;
for (const f of orphans) {
  bytes += (await stat(join(UPLOAD_DIR, f))).size;
}

console.log(`[prune] ${files.length} files, ${files.length - orphans.length} referenced`);
console.log(`[prune] ${orphans.length} orphaned (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`[prune] ${deadCrops.length} unused crop(s)`);

if (deadCrops.length) {
  for (const crop of deadCrops)
    console.log(`  ${doDelete ? 'removing' : 'unused  '} crop ${crop.url}`);

  if (doDelete) {
    for (const crop of deadCrops) {
      for (const url of [crop.url, crop.original_url, crop.thumbnail_url]) {
        if (!url) continue;
        await unlink(join(UPLOAD_DIR, basename(url))).catch(() => {});
      }
    }
    db.prepare(`delete from media where id in (${deadCrops.map(() => '?').join(',')})`).run(
      ...deadCrops.map((c) => c.id)
    );
    console.log(`[prune] removed ${deadCrops.length} crop row(s)`);
  }
}

if (!orphans.length && !deadCrops.length) {
  db.close();
  process.exit(0);
}

for (const f of orphans) console.log(`  ${doDelete ? 'removing' : 'orphan  '} ${f}`);

if (!doDelete) {
  console.log('\n[prune] nothing removed. Re-run with --delete to remove them.');
  db.close();
  process.exit(0);
}

let removed = 0;
for (const f of orphans) {
  try {
    await unlink(join(UPLOAD_DIR, f));
    removed++;
  } catch (err) {
    console.warn(`[prune] could not remove ${f}: ${err.message}`);
  }
}

console.log(`[prune] removed ${removed} file(s)`);
db.close();
