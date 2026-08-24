import { requireUser } from '$lib/server/guards';
import * as v from 'valibot';
import { command } from '$app/server';
import { refreshAllSocialStats } from '$lib/server/social-stats';

export const refreshSocialStats = command(v.object({}), async () => {
  await requireUser();

  const stats = await refreshAllSocialStats();
  return { success: true, stats };
});
