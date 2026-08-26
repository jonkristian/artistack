/**
 * Dragging a file from the media grid onto a curated set.
 *
 * Pointer-based, like the sortable list, and for the same reason: HTML5
 * drag-and-drop doesn't exist on touch, so this was desktop-only. Unlike
 * reordering, the drag crosses from one component to another, so the two ends
 * meet through this store — the grid says what's moving, the zones say where
 * they are, and the drop is matched by hit-testing.
 */
import { beginDragGesture } from '$lib/utils/drag';

type DropHandler = (mediaId: number) => void;

let dragging = $state<number | null>(null);
let overZone = $state<string | null>(null);

const zones = new Map<string, DropHandler>();

/** How far the pointer must travel before this counts as a drag and not a tap. */
const THRESHOLD = 6;

export const mediaDrag = {
  get dragging() {
    return dragging;
  },
  get overZone() {
    return overZone;
  },

  /** A zone registers while mounted; the key also identifies it in the DOM. */
  register(key: string, onDrop: DropHandler) {
    zones.set(key, onDrop);
    return () => zones.delete(key);
  },

  /**
   * Begins tracking a possible drag from a tile.
   *
   * Nothing happens until the pointer moves past the threshold, so a tap still
   * reaches whatever is underneath — the tiles are also buttons.
   */
  start(mediaId: number, e: PointerEvent) {
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const target = e.target as HTMLElement;
    let armed = false;
    // From pointerdown, not from the threshold: text selection starts on the
    // very first move, and on touch the long-press menu fires at about half a
    // second, before any movement has happened at all.
    const endDragGesture = beginDragGesture();

    const move = (ev: PointerEvent) => {
      if (!armed) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
        armed = true;
        dragging = mediaId;
        try {
          target.setPointerCapture(ev.pointerId);
        } catch {
          // Best-effort; the listeners below still track the gesture.
        }
      }

      // Capture routes events here, so the zone under the pointer has to be
      // found by hit-testing rather than by its own handlers.
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      overZone = under?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone ?? null;
    };

    const finish = (ev: PointerEvent) => {
      endDragGesture();
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // Never captured, or already released.
      }

      if (armed && overZone) zones.get(overZone)?.(mediaId);
      dragging = null;
      overZone = null;
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }
};
