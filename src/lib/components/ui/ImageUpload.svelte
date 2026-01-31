<script lang="ts">
	import { updateProfileImage } from '../../../routes/admin/data.remote';
	import { invalidateAll } from '$app/navigation';
	import { ImageModal, type Shape } from '$lib/components/dialogs';

	interface Props {
		value: string | null;
		type: 'logo' | 'photo' | 'background';
		label: string;
	}

	let { value, type, label }: Props = $props();

	let uploading = $state(false);
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;
	let pendingFile = $state<File | null>(null);

	// Determine crop shapes and aspect ratio based on type
	const shapes = $derived<Shape[]>(
		type === 'photo'
			? ['circle', 'rounded', 'square', 'wide', 'wide-rounded']
			: ['circle', 'rounded', 'square']
	);
	const defaultShape = $derived<Shape>(type === 'photo' ? 'wide-rounded' : 'circle');
	const displayAspectRatio = $derived(type === 'photo' ? '16/9' : '1/1');

	async function uploadFile(file: File) {
		uploading = true;

		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', type);

			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				const err = await res.json();
				alert(err.message || 'Upload failed');
				return;
			}

			const { url } = await res.json();

			// Update profile with the new image URL using remote command
			await updateProfileImage({ type, url });
			await invalidateAll();
		} finally {
			uploading = false;
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			pendingFile = file;
		}
		// Reset input so the same file can be selected again
		input.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file && file.type.startsWith('image/')) {
			pendingFile = file;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	async function removeImage() {
		await updateProfileImage({ type, url: null });
		await invalidateAll();
	}

	function handleCropConfirm(croppedFile: File) {
		pendingFile = null;
		uploadFile(croppedFile);
	}

	function handleCropCancel() {
		pendingFile = null;
	}

	async function editExisting() {
		if (!value) return;
		try {
			const res = await fetch(value);
			const blob = await res.blob();
			const file = new File([blob], 'edit.jpg', { type: blob.type });
			pendingFile = file;
		} catch (err) {
			console.error('Failed to load image for editing:', err);
		}
	}
</script>

<div class="space-y-2">
	<span class="block text-sm text-gray-400">{label}</span>

	<div
		class="relative overflow-hidden rounded-lg border-2 border-dashed transition-colors {dragOver
			? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10'
			: 'border-gray-600 hover:border-gray-500'}"
		style="aspect-ratio: {displayAspectRatio}"
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="button"
		tabindex="0"
		onclick={() => fileInput.click()}
		onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
	>
		{#if value}
			<img src={value} alt={label} class="h-full w-full object-cover" />
			<div
				class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100"
			>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							editExisting();
						}}
						class="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
					>
						Edit
					</button>
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							fileInput.click();
						}}
						class="rounded bg-white px-3 py-1.5 text-sm font-medium text-gray-900"
					>
						Replace
					</button>
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							removeImage();
						}}
						class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
					>
						Remove
					</button>
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col items-center justify-center p-4 text-center">
				{#if uploading}
					<div class="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white"></div>
					<span class="text-sm text-gray-400">Uploading...</span>
				{:else}
					<svg class="mb-2 h-10 w-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<span class="text-sm text-gray-400">
						Drop image here or click to upload
					</span>
					<span class="mt-1 text-xs text-gray-500">PNG, JPG, WebP up to 5MB</span>
				{/if}
			</div>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg"
		onchange={handleFileSelect}
		class="hidden"
	/>
</div>

<ImageModal
	file={pendingFile}
	{shapes}
	{defaultShape}
	onconfirm={handleCropConfirm}
	oncancel={handleCropCancel}
/>
