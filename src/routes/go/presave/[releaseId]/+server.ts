import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { releases } from '$lib/server/schema';
import { isBot, isOwnVisit, recordAction } from '$lib/server/tracking';
import type { RequestHandler } from './$types';

/**
 * A release's pre-save button, counted on its way out — the one thing a release
 * page asks for before there's anything to play.
 */
export const GET: RequestHandler = async (event) => {
  const id = Number(event.params.releaseId);
  if (!Number.isInteger(id)) error(400, 'Invalid release');

  const [release] = await db
    .select({ presaveUrl: releases.presaveUrl })
    .from(releases)
    .where(eq(releases.id, id))
    .limit(1);
  if (!release?.presaveUrl) error(404, 'No pre-save for this release');

  const { request } = event;
  if (!isBot(request.headers.get('user-agent') || '') && !isOwnVisit(request.headers)) {
    // Not awaited: the listener is mid-redirect.
    recordAction(event, 'presave', id).catch(() => {});
  }

  redirect(302, release.presaveUrl);
};
