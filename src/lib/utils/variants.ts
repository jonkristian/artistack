import type { Product, ProductVariant } from '$lib/server/schema';

/**
 * Sizes, and where the stock actually lives.
 *
 * A product either has variants — in which case each carries its own count and
 * the product's own `stock` is meaningless — or it doesn't, and `stock` is the
 * count. Every place that asks "is there one left" has to make that distinction
 * the same way, so it's made here once rather than at each call site.
 */

/** The variants worth showing: named, and not an empty list. */
export function variantsOf(product: Pick<Product, 'variants'>): ProductVariant[] {
  const list = product.variants;
  if (!Array.isArray(list)) return [];
  return list.filter((variant) => variant?.name?.trim());
}

export function hasVariants(product: Pick<Product, 'variants'>): boolean {
  return variantsOf(product).length > 0;
}

/**
 * How many are left, for one variant or for the product itself.
 *
 * Null means unlimited, at both levels. A variant asked for by a name that
 * isn't there returns 0 rather than unlimited — an unknown size is not an
 * infinite supply of it, and the difference decides whether something can be
 * oversold.
 */
export function stockOf(
  product: Pick<Product, 'stock' | 'variants'>,
  variant?: string | null
): number | null {
  const list = variantsOf(product);
  if (list.length === 0) return product.stock;

  const found = list.find((v) => v.name === variant);
  return found ? found.stock : 0;
}

/**
 * What's left across the whole product, for a list or a badge.
 *
 * Unlimited wins: if any size is unlimited the product is, because the number
 * would otherwise claim a limit that isn't there.
 */
export function totalStock(product: Pick<Product, 'stock' | 'variants'>): number | null {
  const list = variantsOf(product);
  if (list.length === 0) return product.stock;
  if (list.some((v) => v.stock == null)) return null;
  return list.reduce((sum, v) => sum + (v.stock ?? 0), 0);
}

/** Nothing left in any size. Distinct from having no stock figure at all. */
export function isSoldOut(product: Pick<Product, 'stock' | 'variants'>): boolean {
  return totalStock(product) === 0;
}

/** A line's name as it reads to a person: "Tour T-Shirt (M)". */
export function withVariant(name: string, variant?: string | null): string {
  return variant ? `${name} (${variant})` : name;
}

/** The heading for the choice, when a product asks someone to make one. */
export function variantLabelOf(product: Pick<Product, 'variantLabel'>): string {
  return product.variantLabel?.trim() || 'Options';
}
