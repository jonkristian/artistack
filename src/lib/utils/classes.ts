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
  'rounded-lg border border-gray-700 bg-field px-3 py-2 text-sm text-gray-50 ' +
  'placeholder-gray-500 focus:border-gray-600 focus:outline-none';

/** Text, url, number, select and textarea inputs. */
export const fieldClass = 'w-full ' + fieldBase;

/** The label above a field. */
export const labelClass = 'mb-1 block text-sm text-gray-400';

/**
 * The name over a group of controls, rather than over one field.
 *
 * A different job from `labelClass` and so a different size: a label points at
 * the thing under it, a heading says where a block begins and ends. There were
 * four spellings of this one idea in the clip editor alone — two weights, two
 * greys and three margins — which is enough difference to read as a hierarchy
 * that isn't there.
 */
export const groupTitleClass =
  'mb-2 block text-xs font-semibold tracking-wide text-gray-400 uppercase';

/**
 * A field with something attached inside it — a button, a unit, an icon.
 *
 * The border, background and focus ring move to a wrapper so that whatever is
 * attached sits inside them rather than beside them. Two controls that share an
 * outline read as one control with an action; the same two side by side read as
 * a field and an unrelated button that happens to be next to it.
 *
 * The caller sets the width on the wrapper, not the input: the input is only
 * ever the space left over once the attachment has taken its own.
 */
export const fieldGroupClass =
  'flex items-center rounded-lg border border-gray-700 bg-field ' + 'focus-within:border-gray-600';

/** The input inside a fieldGroup: no chrome of its own, the wrapper has it. */
export const bareInputClass =
  'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-50 placeholder-gray-500 ' +
  'focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none' +
  ' [&::-webkit-outer-spin-button]:appearance-none';

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

/**
 * Removing something, wherever it is asked for.
 *
 * One shape for every delete: five screens had written their own, and they
 * had drifted — different radii, different padding, and a `red-950` fill that
 * is not part of the themed ramp, so in a light theme it stayed a dark red
 * behind pale red words and came out a muddy mauve nobody could read.
 *
 * Built from translucent red over whatever surface it sits on rather than a
 * fixed dark fill, so it works on all three. The words take the `light:`
 * variant because red has to go darker on a light background, not lighter,
 * and that is the one thing a single colour cannot do.
 */
export const dangerButtonClass =
  'w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium ' +
  'text-red-400 light:text-red-700 transition-colors ' +
  // `light:hover:` as well as `hover:`. The two plain variants carry the same
  // specificity, so on a light theme `light:text-red-700` was winning even
  // while hovered — dark red on a solid red fill. Pairing them puts the hover
  // one selector ahead in both themes.
  'hover:border-red-600 hover:bg-red-600 hover:text-white light:hover:text-white';
