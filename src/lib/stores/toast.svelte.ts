type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** A way to take it back, for the things that can be. */
  action?: { label: string; run: () => void };
}

let toasts = $state<Toast[]>([]);
let nextId = 0;
let recentMessages = new Set<string>();

export function toast(
  message: string,
  type: ToastType = 'info',
  action?: { label: string; run: () => void }
) {
  /*
   * Duplicate suppression, but never for a toast carrying an action: deleting
   * two captions in a row produces the same sentence twice, and swallowing the
   * second would swallow the only way back from it.
   */
  const key = `${type}:${message}`;
  if (!action) {
    if (recentMessages.has(key)) return;
    recentMessages.add(key);
    setTimeout(() => recentMessages.delete(key), 2000);
  }

  const id = nextId++;
  toasts.push({ id, message, type, action });

  // Long enough to notice something went wrong and act on it; the plain ones
  // are only telling you something worked.
  const duration = type === 'error' ? 6000 : action ? 8000 : 4000;
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
  }, duration);
}

toast.success = (message: string) => toast(message, 'success');
toast.error = (message: string) => toast(message, 'error');
toast.info = (message: string) => toast(message, 'info');

/**
 * Says what happened and offers to undo it.
 *
 * For the deletions in an editor that saves as you go: there is no Update to
 * withhold and no draft to discard, so the moment right after is the only
 * chance to change your mind, and it has to be offered rather than waited for.
 */
toast.undoable = (message: string, undo: () => void) =>
  toast(message, 'info', { label: 'Undo', run: undo });

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
}

export function getToasts() {
  return toasts;
}
