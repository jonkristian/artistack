/**
 * Shared class strings for admin form controls.
 *
 * These were spelled out inline ~50 times across Settings, Users, Integrations,
 * the block editors and the clip studio — identical strings that drifted apart
 * in a few places (three different focus colours, two label spacings). Kept as
 * strings rather than a component because most call sites wire their own
 * `onblur`/`onchange` handlers, and wrapping them in a component would mean
 * rewiring event handling for no gain.
 *
 * The values are the ones already dominant in the codebase, not new choices.
 */

/** Everything a field looks like except how wide it is. */
const fieldBase =
  'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white ' +
  'placeholder-gray-500 focus:border-gray-600 focus:outline-none';

/** Text, url, number, select and textarea inputs. */
export const fieldClass = 'w-full ' + fieldBase;

/** The label above a field. */
export const labelClass = 'mb-1 block text-sm text-gray-400';

/**
 * Number field for dense rows — clip trim points, caption timings. Same size as
 * every other field; the caller sets the width, since these sit in flex rows
 * rather than a form grid.
 *
 * Spinners are hidden: they crowd a narrow field, and nobody finds an edit
 * point by stepping a tenth of a second at a time.
 */
export const numberClass =
  fieldBase +
  ' [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none' +
  ' [&::-webkit-outer-spin-button]:appearance-none';

/**
 * The tile grid behind the Media, Clips and Releases lists.
 *
 * All three are the same kind of page — a library of things you open — and the
 * grid string was copied between Media and Clips, so they were one edit away
 * from drifting apart. One constant keeps them a set, and is the single place
 * to change tile size.
 *
 * `min(100%, …)` rather than a bare minimum: a track that can't shrink below
 * its floor overflows a narrow screen, so this yields one full-width column
 * instead of a cramped two.
 */
export const tileGridClass =
  'grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-4';
