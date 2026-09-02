/**
 * Fills the shop with things to look at.
 *
 * For testing layouts and the checkout, not for a real site — everything it
 * writes is named from a fixed list, and `--clear` removes exactly that list.
 * That's what makes it safe to run against a database with real products in
 * it: it can only ever delete what it created.
 *
 *   node scripts/seed-shop.mjs          # add what's missing
 *   node scripts/seed-shop.mjs --clear  # take them all away again
 *
 * The catalogue deliberately covers every state the shop can be in — sold out,
 * unlimited, hidden, priced on request, physical and digital — because those
 * are the branches that go untested when you seed ten identical t-shirts.
 */
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? 'data/artistack.db';
const clear = process.argv.includes('--clear');

const db = new Database(DB_PATH);

/**
 * Pictures come from whatever is already in the media library.
 *
 * Square ones first: the shop draws products in a square tile, and a 16:9 band
 * photo cropped to that loses its heads. Falls back to anything rather than
 * failing, because a seeded shop with no pictures is still worth looking at.
 */
const images = db
  .prepare(
    `select url, width, height from media
     where mime_type like 'image/%' and url is not null
     order by case when width is not null and height is not null
                    and abs(cast(width as real) / height - 1.0) < 0.1 then 0 else 1 end,
              id`
  )
  .all()
  .map((row) => row.url);

if (!clear && images.length === 0) {
  console.error('[seed-shop] no images in the media library — upload something first');
  process.exit(1);
}

/** Cycles, so a small library still dresses the whole catalogue. */
const picture = (index) => images[index % images.length] ?? null;

const CATALOGUE = [
  // Apparel — the bread and butter, and where stock actually matters.
  {
    name: 'Tour T-Shirt (Black)',
    description: 'Heavy cotton. S–XXL.',
    price: 29900,
    tags: ['Merch', 'Apparel'],
    stock: 24
  },
  {
    name: 'Tour T-Shirt (White)',
    description: 'Heavy cotton. S–XXL.',
    price: 29900,
    tags: ['Merch', 'Apparel'],
    stock: 6
  },
  // Zero, not hidden: sold out is a state people should see.
  {
    name: 'Logo Hoodie',
    description: 'Embroidered front, printed back.',
    price: 69900,
    tags: ['Merch', 'Apparel'],
    stock: 0
  },
  {
    name: 'Longsleeve',
    description: 'Print down both sleeves.',
    price: 39900,
    tags: ['Merch', 'Apparel'],
    stock: 11
  },
  {
    name: 'Snapback Cap',
    description: 'One size.',
    price: 24900,
    tags: ['Merch', 'Apparel'],
    stock: null
  },

  // Music — the reason anyone came.
  {
    name: 'I Will Be Me — 7" Vinyl',
    description: 'Limited first pressing, 300 copies.',
    price: 24900,
    tags: ['Music'],
    stock: 42
  },
  {
    name: 'I Will Be Me — CD',
    description: 'Digipak with a printed insert.',
    price: 14900,
    tags: ['Music'],
    stock: 80
  },
  {
    name: 'Cassette (Purple Shell)',
    description: 'Because someone always asks.',
    price: 12900,
    tags: ['Music'],
    stock: 15
  },
  // No price and a link out: "ask" is a conversation, not a transaction.
  {
    name: 'Test Pressing (1 of 5)',
    description: 'Signed. Get in touch.',
    price: null,
    tags: ['Music'],
    stock: 5,
    externalUrl: 'https://example.com/enquire'
  },

  // Prints — cheap things that pad a basket out.
  {
    name: 'Tour Poster A2',
    description: 'Offset printed, rolled in a tube.',
    price: 19900,
    tags: ['Merch', 'Prints'],
    stock: null
  },
  {
    name: 'Sticker Pack',
    description: 'Five vinyl stickers.',
    price: 4900,
    tags: ['Merch', 'Prints'],
    stock: 200
  },
  {
    name: 'Tote Bag',
    description: 'Screen printed, unbleached cotton.',
    price: 17900,
    tags: ['Merch', 'Prints'],
    stock: 30
  },

  // Digital — charged and delivered at once, and the reason download tokens exist.
  {
    name: 'I Will Be Me — WAV',
    description: '24-bit master.',
    price: 5000,
    tags: ['Music', 'Digital'],
    type: 'digital'
  },
  {
    name: 'Demos 2025',
    description: 'Eight rough takes, zipped.',
    price: 8000,
    tags: ['Music', 'Digital'],
    type: 'digital'
  },

  // Hidden, so the admin's Hidden filter has something in it and the public
  // page can be checked for leaks.
  {
    name: 'Secret Bundle (unreleased)',
    description: 'Not announced yet.',
    price: 89900,
    tags: ['Merch', 'Apparel'],
    stock: 10,
    visible: false
  }
];

const names = CATALOGUE.map((item) => item.name);
const placeholders = names.map(() => '?').join(',');

if (clear) {
  /*
   * Taggings go too — the join table has no foreign keys to cascade through, so
   * a deleted product would otherwise leave its rows pointing at nothing.
   */
  db.prepare(
    `delete from taggings where entity_type = 'product' and entity_id in
       (select id from products where name in (${placeholders}))`
  ).run(...names);

  const removed = db.prepare(`delete from products where name in (${placeholders})`).run(...names);
  console.log(`[seed-shop] removed ${removed.changes} seeded product(s)`);
  process.exit(0);
}

/*
 * Skipped rather than overwritten, so running this twice doesn't undo a price
 * you changed by hand while looking at it.
 */
const existing = new Set(
  db
    .prepare(`select name from products where name in (${placeholders})`)
    .all(...names)
    .map((row) => row.name)
);

const { maxPosition } = db
  .prepare('select coalesce(max(position), -1) as maxPosition from products')
  .get();

const insert = db.prepare(
  `insert into products (name, description, price, currency, external_url,
                         visible, featured, position, created_at, type, stock, image_url, file_url)
   values (@name, @description, @price, @currency, @externalUrl,
           @visible, @featured, @position, @createdAt, @type, @stock, @imageUrl, @fileUrl)`
);

/*
 * Tags, the way the app resolves them: matched by slug so seeding twice attaches
 * the existing tag rather than making a second. The slug rule is simplified —
 * these names are ASCII, and the app's own slugify also transliterates.
 */
const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const findTag = db.prepare('select id from tags where slug = ?');
const insertTag = db.prepare('insert into tags (name, slug, created_at) values (?, ?, ?)');
const insertTagging = db.prepare(
  "insert or ignore into taggings (tag_id, entity_type, entity_id) values (?, 'product', ?)"
);

function tagId(name) {
  const slug = slugify(name);
  const found = findTag.get(slug);
  if (found) return found.id;
  return insertTag.run(name, slug, Math.floor(Date.now() / 1000)).lastInsertRowid;
}

let position = maxPosition;
let added = 0;

const seed = db.transaction(() => {
  for (const [index, item] of CATALOGUE.entries()) {
    if (existing.has(item.name)) continue;

    const type = item.type ?? 'physical';
    insert.run({
      name: item.name,
      description: item.description ?? null,
      price: item.price ?? null,
      currency: 'NOK',
      externalUrl: item.externalUrl ?? null,
      visible: item.visible === false ? 0 : 1,
      featured: 0,
      position: ++position,
      createdAt: Date.now(),
      type,
      // A download can't run out, so it has no stock rather than a large number.
      stock: type === 'digital' ? null : (item.stock ?? null),
      imageUrl: picture(index),
      /*
       * A real file, so the download actually delivers something and the
       * gate that keeps it out of /uploads can be seen working. It's a
       * picture pretending to be a record, which is fine for a test.
       */
      fileUrl: type === 'digital' ? picture(index + 7) : null
    });

    const productId = db.prepare('select last_insert_rowid() as id').get().id;
    for (const name of item.tags ?? []) insertTagging.run(tagId(name), productId);

    added++;
  }
});

seed();

console.log(
  `[seed-shop] added ${added} product(s)` +
    (existing.size ? `, skipped ${existing.size} already there` : '')
);
console.log('[seed-shop] remove them again with: node scripts/seed-shop.mjs --clear');
