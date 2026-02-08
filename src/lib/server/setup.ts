import { db } from './db';
import { blocks, links, tourDates } from './schema';
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

  const [tourDatesBlock] = await db
    .select()
    .from(blocks)
    .where(eq(blocks.type, 'tour_dates'))
    .limit(1);

  // Associate orphaned links with the links block
  if (linksBlock) {
    const allLinks = await db.select().from(links);

    for (const link of allLinks) {
      if (!blockIds.includes(link.blockId)) {
        await db.update(links).set({ blockId: linksBlock.id }).where(eq(links.id, link.id));
        console.log(`[Setup] Associated orphaned link ${link.id} with links block`);
      }
    }
  }

  // Associate orphaned tour dates with the tour_dates block
  if (tourDatesBlock) {
    const allTourDates = await db.select().from(tourDates);

    for (const td of allTourDates) {
      if (!blockIds.includes(td.blockId)) {
        await db
          .update(tourDates)
          .set({ blockId: tourDatesBlock.id })
          .where(eq(tourDates.id, td.id));
        console.log(`[Setup] Associated orphaned tour date ${td.id} with tour_dates block`);
      }
    }
  }
}
