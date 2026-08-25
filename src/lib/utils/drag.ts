/**
 * Holding still to start a drag is also the gesture for "open the context
 * menu" — long-press on touch, and a held button on some desktop setups. The
 * menu then steals the pointer and the drag dies under it.
 *
 * Suppressed only while a drag is in flight, so right-click works normally
 * everywhere else. Capture phase, because the menu is raised before the event
 * reaches whatever is underneath.
 */
export function suppressContextMenu(): () => void {
  const block = (e: Event) => e.preventDefault();
  window.addEventListener('contextmenu', block, true);
  return () => window.removeEventListener('contextmenu', block, true);
}
