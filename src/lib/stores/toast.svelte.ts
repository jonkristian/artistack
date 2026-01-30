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

	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 3000);
}

toast.success = (message: string) => toast(message, 'success');
toast.error = (message: string) => toast(message, 'error');
toast.info = (message: string) => toast(message, 'info');

export function getToasts() {
	return toasts;
}
