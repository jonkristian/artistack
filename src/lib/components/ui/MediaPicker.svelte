<script lang="ts">
	import type { Media } from '$lib/server/schema';
	import { ImageModal, type Shape } from '$lib/components/dialogs';

	interface Props {
		value: string | null;
		label: string;
		media: Media[];
		aspectRatio?: string;
		shapes?: Shape[];
		defaultShape?: Shape;
		onselect: (url: string | null, shape?: Shape) => void;
	}

	let {
		value,
		label,
		media,
		aspectRatio = '16/9',
		shapes = ['circle', 'rounded', 'square'],
		defaultShape = 'rounded',
		onselect
	}: Props = $props();

	let showPicker = $state(false);
	let pendingFile = $state<File | null>(null);
	let uploading = $state(false);

	async function handleSelect(item: Media) {
		showPicker = false;

		// Fetch the image and open crop modal
		try {
			const res = await fetch(item.url);
			const blob = await res.blob();
			const file = new File([blob], item.filename, { type: item.mimeType });
			pendingFile = file;
		} catch (err) {
			console.error('Failed to load image for cropping:', err);
		}
	}

	async function handleCropConfirm(croppedFile: File, selectedShape: Shape) {
		pendingFile = null;
		uploading = true;

		try {
			const formData = new FormData();
			formData.append('file', croppedFile);
			formData.append('type', 'cropped');

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
			onselect(url, selectedShape);
		} finally {
			uploading = false;
		}
	}

	function handleCropCancel() {
		pendingFile = null;
	}

	function handleRemove() {
		onselect(null);
	}

	async function handleEdit() {
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
		class="relative overflow-hidden rounded-lg border-2 border-dashed border-gray-600 transition-colors hover:border-gray-500"
		style="aspect-ratio: {aspectRatio}"
	>
		{#if value}
			<img src={value} alt={label} class="h-full w-full object-cover" />
			<div
				class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity hover:opacity-100"
			>
				{#if uploading}
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
				{:else}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={handleEdit}
							class="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
						>
							Edit
						</button>
						<button
							type="button"
							onclick={() => (showPicker = true)}
							class="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-white"
						>
							Replace
						</button>
						<button
							type="button"
							onclick={handleRemove}
							class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
						>
							Remove
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showPicker = true)}
				disabled={uploading}
				class="flex h-full w-full flex-col items-center justify-center p-4 text-center"
			>
				{#if uploading}
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-white"></div>
				{:else}
					<svg class="mb-2 h-10 w-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<span class="text-sm text-gray-400">Select from library</span>
				{/if}
			</button>
		{/if}
	</div>
</div>

<!-- Media Picker Modal -->
{#if showPicker}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		onclick={() => (showPicker = false)}
		onkeydown={(e) => e.key === 'Escape' && (showPicker = false)}
		role="dialog"
		aria-modal="true"
		aria-label="Select media"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<div class="flex items-center justify-between border-b border-gray-700 p-4">
				<h2 class="text-lg font-semibold text-white">Select Media</h2>
				<div class="flex items-center gap-3">
					<a
						href="/admin/media"
						class="text-sm text-violet-400 hover:text-violet-300"
					>
						Manage library
					</a>
					<button
						onclick={() => (showPicker = false)}
						class="text-gray-400 hover:text-white"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-4">
				{#if media.length === 0}
					<div class="flex flex-col items-center justify-center py-12">
						<svg class="mb-4 h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
						<p class="mb-2 text-gray-400">No media in library</p>
						<a
							href="/admin/media"
							class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
						>
							Upload media
						</a>
					</div>
				{:else}
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
						{#each media as item (item.id)}
							<button
								type="button"
								onclick={() => handleSelect(item)}
								class="group relative aspect-square overflow-hidden rounded-lg ring-2 transition-all ring-transparent hover:ring-violet-500"
							>
								<img
									src={item.thumbnailUrl || item.url}
									alt={item.alt || item.filename}
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<ImageModal
	file={pendingFile}
	{shapes}
	{defaultShape}
	onconfirm={handleCropConfirm}
	oncancel={handleCropCancel}
/>
