/**
 * The position after the last item in an ordered list.
 *
 * After the highest, not at the count: a removed item leaves a gap, and the
 * count would then tie with whatever already sits at the end. Shared by the
 * server and the editors so a link added either way lands in the same place.
 */
export function getNextPosition<T extends { position?: number | null }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1;
}
