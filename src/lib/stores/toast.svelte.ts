type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toasts = $state<Toast[]>([]);
let nextId = 0;
let recentMessages = new Set<string>();

export function toast(message: string, type: ToastType = 'info') {
  // Prevent duplicate messages within 2 seconds
  const key = `${type}:${message}`;
  if (recentMessages.has(key)) return;

  recentMessages.add(key);
  setTimeout(() => recentMessages.delete(key), 2000);

  const id = nextId++;
  toasts.push({ id, message, type });

  const duration = type === 'error' ? 6000 : 4000;
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
  }, duration);
}

toast.success = (message: string) => toast(message, 'success');
toast.error = (message: string) => toast(message, 'error');
toast.info = (message: string) => toast(message, 'info');

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
}

export function getToasts() {
  return toasts;
}
