import type { Act } from '$lib/server/schema';

/** A line-up entry as the public page and the shows block render it. */
export type ResolvedAct = {
  name: string;
  logoUrl: string | null;
  isSelf: boolean;
  setTime: string | null;
};

/**
 * Turns a show's stored line-up — act ids and set times — into the acts
 * themselves.
 *
 * The public routes resolve this server-side, so it isn't sent as ids. The
 * admin previews render the same components from the draft, which holds ids,
 * and they were handing them straight over: every act came out with no name,
 * which crashed the keyed each in ShowsBlock on duplicate `undefined` keys.
 *
 * An entry whose act has been deleted is dropped rather than rendered blank.
 */
export function resolveLineup(
  lineup: { actId: number; setTime: string | null }[] | undefined,
  acts: Act[]
): ResolvedAct[] {
  const byId = new Map(acts.map((a) => [a.id, a]));

  return (lineup ?? [])
    .map((entry) => {
      const act = byId.get(entry.actId);
      return act
        ? { name: act.name, logoUrl: act.logoUrl, isSelf: act.isSelf, setTime: entry.setTime }
        : null;
    })
    .filter((a): a is ResolvedAct => a !== null);
}

/** The same, for a list of shows on their way into a theme. */
export function withResolvedLineups<
  T extends { lineup?: { actId: number; setTime: string | null }[] }
>(shows: T[], acts: Act[]): (T & { lineup: ResolvedAct[] })[] {
  return shows.map((show) => ({ ...show, lineup: resolveLineup(show.lineup, acts) }));
}
