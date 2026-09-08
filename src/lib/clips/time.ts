/**
 * Times on the timeline, kept to a precision anyone would recognise.
 *
 * Seconds arrive from arithmetic — a trim converted through a speed, a start
 * added to a length — and binary floating point turns 198.225 into
 * 198.22500000000002 on the way. Nothing is wrong with the number; it is wrong
 * with the reading of it, and a row that says a bed runs to
 * `198.22500000000002s` is asking someone to trust a tool that looks like it
 * cannot count.
 *
 * Hundredths throughout: finer than a drag can honestly claim — a hundredth of
 * a second is a fraction of a pixel at any usable zoom — and fine enough for
 * the one job that wants better than a tenth, which is lining a bed up against
 * a beat by typing.
 */

/** Rounds a time to hundredths. Use whenever one is about to be stored. */
export function tidy(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/**
 * A time as short as it can be written without lying about it.
 *
 * Trailing zeros are dropped because 0.20 and 0.2 are the same number and only
 * one of them is worth the width.
 */
export function secs(seconds: number): string {
  return String(tidy(seconds));
}
