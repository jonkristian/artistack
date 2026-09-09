/**
 * Closes a modal `<dialog>` when the click lands outside it.
 *
 * A native modal darkens the page and stops you touching anything behind it,
 * and then does nothing when you press that darkness — which reads as a dialog
 * you are stuck in, so people hunt for the X. There is no separate backdrop
 * element to listen to: the backdrop is the dialog's own box, so a press that
 * lands on the element rather than on anything inside it is a press outside.
 *
 * Both ends of the press are checked. Selecting a filename by dragging from
 * inside a field and releasing past the edge is one click on the dialog, and
 * closing a form because someone swept up some text would be worse than not
 * closing at all.
 */
export function dismissable(node: HTMLDialogElement) {
  let from: EventTarget | null = null;

  const down = (e: MouseEvent) => (from = e.target);
  const click = (e: MouseEvent) => {
    if (e.target === node && from === node) node.close();
  };

  node.addEventListener('mousedown', down);
  node.addEventListener('click', click);

  return {
    destroy() {
      node.removeEventListener('mousedown', down);
      node.removeEventListener('click', click);
    }
  };
}
