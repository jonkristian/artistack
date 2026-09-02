import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { createReadStream, statSync } from 'fs';
import { basename, join, normalize } from 'path';
import { Readable } from 'stream';
import type { RequestHandler } from './$types';

/**
 * Handing over a file that's been paid for.
 *
 * The token is the whole of the authorisation — it's random, single-purpose and
 * only issued once the money is in — so there's no sign-in here. It's checked
 * against the order every time rather than trusted on its own, which is what
 * makes a refunded order stop working.
 */
export const GET: RequestHandler = async ({ params }) => {
  const [row] = await db
    .select({ fileUrl: orderItems.fileUrl, name: orderItems.name, status: orders.paymentStatus })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.downloadToken, params.token))
    .limit(1);

  // One message for a wrong token and a revoked one: telling them apart tells
  // someone probing that a token was real.
  if (!row || !row.fileUrl) error(404, 'Not found');
  if (row.status !== 'authorised' && row.status !== 'captured') error(404, 'Not found');

  /*
   * The stored URL is `/uploads/<name>`, and only the name is used. Building
   * the path from anything else in it would let a crafted product file reach
   * outside the uploads directory.
   */
  const path = join('data/uploads', basename(row.fileUrl));
  if (normalize(path) !== path) error(404, 'Not found');

  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    error(404, 'Not found');
  }

  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      // Named after what they bought, not after the hash it's stored under.
      'Content-Disposition': `attachment; filename="${basename(row.fileUrl)}"`,
      // A paid file has no business in a shared cache.
      'Cache-Control': 'private, no-store'
    }
  });
};
