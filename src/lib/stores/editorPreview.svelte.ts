/**
 * Which half of an editor/preview page is on screen at narrow widths.
 *
 * The switch belongs in the admin's top bar — it's one row on a phone, and a
 * second bar just for two buttons wastes a tenth of the screen. But the bar
 * lives in the layout and the panes live in the page, so the state meets in the
 * middle here rather than being threaded through a slot.
 */
type Pane = 'editor' | 'preview';

let active = $state(false);
let showing = $state<Pane>('editor');

export const editorPreview = {
  /** True only while a page with two panes is mounted. */
  get active() {
    return active;
  },
  get showing() {
    return showing;
  },
  show(pane: Pane) {
    showing = pane;
  },
  /** Called by the pane component; returns its own teardown. */
  register() {
    active = true;
    showing = 'editor';
    return () => {
      active = false;
    };
  }
};
