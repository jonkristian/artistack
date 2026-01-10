<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { addMedia, deleteMedia } from './data.remote';

	let { data }: { data: PageData } = $props();

	let fileInput: HTMLInputElement;
	let uploading = $state(false);
	let displayCount = $state(20);

	// Paginated media
	const visibleMedia = $derived(data.media.slice(0, displayCount));
	const hasMore = $derived(data.media.length > displayCount);
	const remainingCount = $derived(data.media.length - displayCount);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			// Upload all selected files
			for (const file of files) {
				await uploadFile(file);
			}
		}
		input.value = '';
	}

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

	async function uploadFile(file: File) {
		// Client-side size check
		if (file.size > MAX_FILE_SIZE) {
			alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
			return;
		}

		uploading = true;

		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', 'media');

			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) {
				let message = 'Upload failed';
				try {
					const err = await res.json();
					message = err.message || message;
				} catch {
					// Response might not be JSON (e.g., body limit error)
					if (res.status === 413) {
						message = 'File too large. Maximum size is 10MB.';
					}
				}
				alert(message);
				return;
			}

			const { url, thumbnailUrl, width, height, size, mimeType } = await res.json();

			// Add to media library with all metadata from server
			await addMedia({
				filename: file.name,
				url,
				thumbnailUrl,
				mimeType,
				width,
				height,
				size
			});

			await invalidateAll();
		} finally {
			uploading = false;
		}
	}

	async function handleDelete(id: number) {
		if (!confirm('Delete this image?')) return;
		await deleteMedia(id);
		await invalidateAll();
	}

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(date: Date | null): string {
		if (!date) return '';
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}
</script>

<div class="min-h-screen bg-gray-950 p-6">
	<header class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-white">Media Library</h1>
			<p class="text-sm text-gray-500">Upload originals, crop when you use them</p>
		</div>
		<button
			onclick={() => fileInput.click()}
			disabled={uploading}
			class="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
		>
			{#if uploading}
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
				Uploading...
			{:else}
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Upload
			{/if}
		</button>
	</header>

	{#if data.media.length === 0}
		<div class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-700 py-16">
			<svg class="mb-4 h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="mb-2 text-lg font-medium text-gray-400">No media yet</p>
			<p class="mb-4 text-sm text-gray-500">Upload images to build your media library</p>
			<button
				onclick={() => fileInput.click()}
				class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
			>
				Upload your first image
			</button>
		</div>
	{:else}
		<p class="mb-4 text-sm text-gray-500">{data.media.length} images</p>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each visibleMedia as item (item.id)}
				<div class="group relative overflow-hidden rounded-xl bg-gray-800">
					<div class="aspect-square">
						<img
							src={item.thumbnailUrl || item.url}
							alt={item.alt || item.filename}
							loading="lazy"
							class="h-full w-full object-cover"
						/>
					</div>
					<!-- Hover overlay -->
					<div class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
						<button
							onclick={() => handleDelete(item.id)}
							class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
						>
							Delete
						</button>
						<div class="mt-3 text-center text-xs text-gray-400">
							{#if item.width && item.height}
								<p>{item.width} x {item.height}</p>
							{/if}
							{#if item.size}
								<p>{formatFileSize(item.size)}</p>
							{/if}
						</div>
					</div>
					<!-- Info bar -->
					<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6">
						<p class="truncate text-sm text-white">{item.alt || item.filename}</p>
						<p class="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
					</div>
				</div>
			{/each}
		</div>

		{#if hasMore}
			<button
				type="button"
				onclick={() => (displayCount += 20)}
				class="mt-6 w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
			>
				Load more ({remainingCount} remaining)
			</button>
		{/if}
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/gif"
		multiple
		onchange={handleFileSelect}
		class="hidden"
	/>
</div>
