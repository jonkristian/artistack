import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { db } from '$lib/server/db';
import { products } from '$lib/server/schema';
import { getNextPosition } from '$lib/server/api';
import { eq } from 'drizzle-orm';
import { setTags, clearTags } from '$lib/server/tags';
import { error } from '@sveltejs/kit';

/**
 * The shop's contents.
 *
 * A product is a thing you sell, not a page — you click through to buy it, so
 * it has no address of its own. The shop itself is one page listing them.
 */

/*
 * Every field optional: an update carries only what changed, so that a sale
 * decrementing stock isn't overwritten by a form that never touched it.
 */
const productSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty('Give the product a name'))),
  description: v.optional(v.nullable(v.string())),
  /**
   * Minor units — øre, cents — because a price in decimals is a rounding error
   * waiting to be charged to someone. Null means "ask", which is a real answer
   * for a one-off.
   */
  price: v.optional(v.nullable(v.number())),
  currency: v.optional(v.nullable(v.string())),
  type: v.optional(v.picklist(['physical', 'digital'])),
  /** Null is unlimited. A number runs out. */
  stock: v.optional(v.nullable(v.number())),
  /**
   * Sizes, each with its own count. Null or empty means the product has none
   * and `stock` above is the count.
   *
   * Declared here or it would be dropped: valibot strips what a schema doesn't
   * name, so a missing entry means a save that reports success and writes
   * nothing — which this codebase has already been bitten by once.
   */
  /** "Size", "Colour" — what the options below are options of. */
  variantLabel: v.optional(v.nullable(v.string())),
  variants: v.optional(
    v.nullable(
      v.array(
        v.object({
          name: v.pipe(v.string(), v.trim()),
          stock: v.nullable(v.number())
        })
      )
    )
  ),
  imageUrl: v.optional(v.nullable(v.string())),
  fileUrl: v.optional(v.nullable(v.string())),
  externalUrl: v.optional(v.nullable(v.string())),
  /**
   * Tag names, replacing the whole set.
   *
   * The shared vocabulary rather than a category of the product's own — the
   * same words that file clips and media, so "what is tagged merch" is one
   * question across kinds.
   */
  tags: v.optional(v.array(v.string())),
  visible: v.optional(v.nullable(v.boolean())),
  featured: v.optional(v.nullable(v.boolean())),
  position: v.optional(v.nullable(v.number()))
});

export const createProduct = command(
  v.object({ name: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the product a name')) }),
  async ({ name }) => {
    await requireUser();

    const existing = await db.select().from(products);

    // Hidden to start with: a product is half-entered the moment it exists, and
    // a shop that shows it before it has a price or a picture is worse than one
    // that shows nothing.
    const [created] = await db
      .insert(products)
      .values({ name, visible: false, position: getNextPosition(existing) })
      .returning();

    return { product: created };
  }
);

export const updateProduct = command(
  v.object({ id: v.number(), ...productSchema.entries }),
  async ({ id, ...updates }) => {
    await requireUser();

    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) error(404, 'That product no longer exists.');

    // Tags live in their own table, so they're pulled out before the rest is
    // treated as columns.
    const { tags, ...fields } = updates;
    if (tags !== undefined) {
      await setTags('product', id, tags);
    }

    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) changes[key] = value;
    }

    /*
     * A half-typed size is dropped rather than stored. An unnamed variant can't
     * be chosen, can't be fulfilled and would render as a blank button — and
     * one is left behind every time somebody clicks Add a size and thinks
     * better of it.
     */
    if (Array.isArray(changes.variants)) {
      const named = (changes.variants as { name: string }[]).filter((v) => v.name.trim() !== '');
      changes.variants = named.length > 0 ? named : null;
    }

    if (Object.keys(changes).length > 0) {
      await db.update(products).set(changes).where(eq(products.id, id));
    }

    return { success: true };
  }
);

export const deleteProduct = command(v.object({ id: v.number() }), async ({ id }) => {
  await requireUser();

  /*
   * Deleted outright, which is safe only while nothing has been sold. Once
   * orders exist they copy the name and price onto their own rows, so a receipt
   * survives this — but that's the reason those columns are copied rather than
   * joined.
   */
  // The join table has no foreign keys to cascade through, so its rows are the
  // caller's to clear.
  await clearTags('product', id);
  await db.delete(products).where(eq(products.id, id));
  return { success: true };
});

export const reorderProducts = command(
  v.array(v.object({ id: v.number(), position: v.number() })),
  async (items) => {
    await requireUser();

    for (const item of items) {
      await db.update(products).set({ position: item.position }).where(eq(products.id, item.id));
    }

    return { success: true };
  }
);
