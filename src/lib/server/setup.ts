import { db } from './db';
import { blocks, links } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Handles data migration for orphaned links/tour dates.
 * Called during app startup to associate orphaned data with existing blocks.
 * Note: Default blocks are created via the setup flow, not here.
 */
export async function ensureBlocksExist() {
  const existingBlocks = await db.select().from(blocks);

  // Skip if no blocks exist yet (user hasn't completed setup)
  if (existingBlocks.length === 0) {
    return;
  }

  // Get current block IDs
  const blockIds = existingBlocks.map((b) => b.id);

  // Get the links block ID for orphaned links
  const [linksBlock] = await db.select().from(blocks).where(eq(blocks.type, 'links')).limit(1);

  // Associate orphaned links with the links block
  if (linksBlock) {
    const allLinks = await db.select().from(links);

    for (const link of allLinks) {
      // A release link has no block on purpose. Adopting it would drag it onto
      // the home page, so only genuinely ownerless links get picked up here.
      if (link.releaseId !== null) continue;

      if (link.blockId === null || !blockIds.includes(link.blockId)) {
        await db.update(links).set({ blockId: linksBlock.id }).where(eq(links.id, link.id));
        console.log(`[Setup] Associated orphaned link ${link.id} with links block`);
      }
    }
  }
}
