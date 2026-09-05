/**
 * Every kind of block there is.
 *
 * Its own module, with no component imports, so the server can validate a
 * block type without pulling the whole registry — and its Svelte components —
 * into the server bundle.
 *
 * This list is the source. `blockRegistry` is typed as `Record<BlockType, …>`,
 * so adding a name here without building the block, or building one without
 * naming it here, is a compile error rather than something you discover when a
 * save fails. It used to be restated in three places and had already drifted:
 * the sign-up block couldn't be saved at all, because whoever added it updated
 * the registry and not the validator.
 */
export const BLOCK_TYPES = [
  'profile',
  'links',
  'shows',
  'releases',
  'image',
  'gallery',
  'email',
  'products'
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
