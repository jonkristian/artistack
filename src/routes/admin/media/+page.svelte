<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import { addMedia, deleteMedia, addToPressKit, removeFromPressKit } from './data.remote';

	let { data }: { data: PageData } = $props();

	let fileInput: HTMLInputElement;
	let uploading = $state(false);
	let displayCount = $state(20);
	let generating = $state(false);
	let dragOverPressKit = $state(false);
	let draggedMediaId = $state<number | null>(null);

	// Bio.txt option for press kit
	let includeBioTxt = $state(true);

	// Track which media items are in press kit
	const pressKitMediaIds = $derived(new Set(data.pressKit.map((p) => p.mediaId)));
	const visibleMedia = $derived(data.media.slice(0, displayCount));
	const hasMore = $derived(data.media.length > displayCount);
	const remainingCount = $derived(data.media.length - displayCount);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			for (const file of files) {
				await uploadFile(file);
			}
		}
		input.value = '';
	}

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

	async function uploadFile(file: File) {
		if (file.size > MAX_FILE_SIZE) {
			toast.error(`File "${file.name}" is too large. Max 10MB.`);
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
					if (res.status === 413) {
						message = 'File too large. Maximum size is 10MB.';
					}
				}
				toast.error(message);
				return;
			}

			const { url, originalUrl, thumbnailUrl, width, height, size, originalSize, mimeType } = await res.json();

			await addMedia({
				filename: file.name,
				url,
				originalUrl,
				thumbnailUrl,
				mimeType,
				width,
				height,
				size,
				originalSize
			});

			await invalidateAll();
			toast.success('Uploaded');
		} finally {
			uploading = false;
		}
	}

	async function handleDelete(id: number) {
		if (!confirm('Delete this image?')) return;
		await deleteMedia(id);
		await invalidateAll();
		toast.success('Deleted');
	}

	// Press Kit drag & drop
	function handleDragStart(e: DragEvent, mediaId: number) {
		draggedMediaId = mediaId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(mediaId));
		}
	}

	function handleDragEnd() {
		draggedMediaId = null;
		dragOverPressKit = false;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOverPressKit = true;
	}

	function handleDragLeave() {
		dragOverPressKit = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOverPressKit = false;

		const mediaId = draggedMediaId || Number(e.dataTransfer?.getData('text/plain'));
		if (!mediaId) return;

		// Don't add if already in press kit
		if (pressKitMediaIds.has(mediaId)) {
			draggedMediaId = null;
			return;
		}

		await addToPressKit({ mediaId });
		await invalidateAll();
		toast.success('Added to Press Kit');
		draggedMediaId = null;
	}

	async function handleRemoveFromPressKit(pressKitId: number) {
		await removeFromPressKit(pressKitId);
		await invalidateAll();
		toast.success('Removed from Press Kit');
	}

	async function handleGeneratePressKit() {
		generating = true;
		try {
			const res = await fetch('/api/press-kit/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ includeBio: includeBioTxt })
			});
			const result = await res.json();

			if (result.success) {
				await invalidateAll();
				toast.success('Press Kit generated!');
			} else {
				toast.error(result.error || 'Failed to generate');
			}
		} catch {
			toast.error('Failed to generate Press Kit');
		}
		generating = false;
	}

	function copyPressKitUrl() {
		const url = `${window.location.origin}/uploads/press-kit.zip`;
		navigator.clipboard.writeText(url);
		toast.success('URL copied!');
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

	<!-- Press Kit Section -->
	<section class="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<svg class="h-6 w-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
				</svg>
				<div>
					<h2 class="font-semibold text-white">Press Kit</h2>
					<p class="text-xs text-gray-500">Drag files here to include them</p>
				</div>
			</div>
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-1.5 text-xs text-gray-400">
					<input type="checkbox" bind:checked={includeBioTxt} class="rounded border-gray-600 bg-gray-700 text-violet-500 focus:ring-violet-500" />
					Include bio
				</label>
				{#if data.pressKitZipExists}
					<button
						onclick={copyPressKitUrl}
						class="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						Copy URL
					</button>
				{/if}
				<button
					onclick={handleGeneratePressKit}
					disabled={generating || data.pressKit.length === 0}
					class="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
				>
					{#if generating}
						<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
						Generating...
					{:else}
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						Generate ZIP
					{/if}
				</button>
			</div>
		</div>

		<!-- Drop zone -->
		<div
			role="region"
			aria-label="Press kit drop zone"
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			class="rounded-lg border-2 border-dashed transition-colors {dragOverPressKit
				? 'border-violet-500 bg-violet-500/10'
				: 'border-gray-700'}"
		>
			{#if data.pressKit.length === 0}
				<div class="flex h-[120px] flex-col items-center justify-center text-gray-500">
					<svg class="mb-2 h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
					</svg>
					<p class="text-sm">Drag files from below to add them</p>
				</div>
			{:else}
				<div class="flex flex-wrap gap-3 p-3">
					{#each data.pressKit as item (item.id)}
						<div class="group relative">
							<div class="h-20 w-20 overflow-hidden rounded-lg bg-gray-800">
								<img
									src={item.media.thumbnailUrl || item.media.url}
									alt={item.media.filename}
									class="h-full w-full object-cover"
								/>
							</div>
							<button
								onclick={() => handleRemoveFromPressKit(item.id)}
								class="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
								aria-label="Remove from press kit"
							>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if data.pressKitZipExists}
			<p class="mt-3 text-xs text-gray-500">
				<a href="/uploads/press-kit.zip" download class="text-violet-400 hover:underline">Download press-kit.zip</a>
				{#if data.bio}
					<span class="text-gray-600">• Includes bio.txt</span>
				{/if}
			</p>
		{/if}
	</section>

	<!-- Media Gallery -->
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
		<p class="mb-4 text-sm text-gray-500">{data.media.length} files {#if data.pressKit.length > 0}· {data.pressKit.length} in press kit{/if}</p>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each visibleMedia as item (item.id)}
				<div
					role="button"
					tabindex="0"
					aria-label={pressKitMediaIds.has(item.id) ? `${item.alt || item.filename} - in press kit` : `Drag ${item.alt || item.filename} to press kit`}
					draggable={!pressKitMediaIds.has(item.id)}
					ondragstart={(e) => handleDragStart(e, item.id)}
					ondragend={handleDragEnd}
					class="group relative overflow-hidden rounded-xl bg-gray-800 {pressKitMediaIds.has(item.id) ? 'cursor-default' : 'cursor-grab'} {draggedMediaId === item.id ? 'opacity-50' : ''}"
				>
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
								<p>{item.width} × {item.height}</p>
							{/if}
							{#if item.size}
								<p>{formatFileSize(item.size)}</p>
							{/if}
						</div>
					</div>
					<!-- Press Kit badge or Drag hint -->
					{#if pressKitMediaIds.has(item.id)}
						<div class="absolute top-2 right-2 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
							In Press Kit
						</div>
					{:else}
						<div class="absolute top-2 right-2 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
							<svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
							</svg>
						</div>
					{/if}
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
		accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg"
		multiple
		onchange={handleFileSelect}
		class="hidden"
	/>
</div>
