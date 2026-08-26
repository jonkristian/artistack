/**
 * The browser gestures that collide with a pointer drag, suppressed for as long
 * as one is in flight. Call on pointerdown and call the returned function when
 * the gesture ends, however it ends.
 *
 * Two of them collide:
 *
 * - The context menu. Holding still to start a drag is also the gesture for
 *   "open the context menu" — long-press on touch, and a held button on some
 *   desktop setups. The menu then steals the pointer and the drag dies.
 * - Text selection. Dragging with the button down is also how you select text,
 *   so a drag across the media grid painted every filename and label blue.
 *
 * Both are capture-phase: the browser acts on these before the event reaches
 * whatever is underneath. Suppressed only during the drag, so right-click and
 * selection work normally everywhere else.
 */
export function beginDragGesture(): () => void {
  const block = (e: Event) => e.preventDefault();
  window.addEventListener('contextmenu', block, true);
  window.addEventListener('selectstart', block, true);
  return () => {
    window.removeEventListener('contextmenu', block, true);
    window.removeEventListener('selectstart', block, true);
  };
}
