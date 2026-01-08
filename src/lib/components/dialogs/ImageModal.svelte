<script lang="ts">
	import { onDestroy } from 'svelte';

	export type Shape = 'circle' | 'rounded' | 'square' | 'wide' | 'wide-rounded';

	interface Props {
		file: File | null;
		shapes?: Shape[];
		defaultShape?: Shape;
		onconfirm: (croppedFile: File, shape: Shape) => void;
		oncancel: () => void;
	}

	let {
		file,
		shapes = ['circle', 'rounded', 'square'],
		defaultShape = 'rounded',
		onconfirm,
		oncancel
	}: Props = $props();

	let shape = $derived<Shape>(defaultShape);

	// Determine aspect from shape
	const isWideShape = $derived(shape === 'wide' || shape === 'wide-rounded');

	const shapeClass = $derived(
		shape === 'circle'
			? 'rounded-full'
			: shape === 'rounded'
				? 'rounded-3xl'
				: shape === 'wide-rounded'
					? 'rounded-xl'
					: 'rounded-none'
	);

	// Shape button config
	const shapeConfig: Record<Shape, { label: string; class: string }> = {
		circle: { label: 'Circle', class: 'h-5 w-5 rounded-full' },
		rounded: { label: 'Rounded', class: 'h-5 w-5 rounded-lg' },
		square: { label: 'Square', class: 'h-5 w-5' },
		wide: { label: 'Wide', class: 'h-4 w-7' },
		'wide-rounded': { label: 'Wide rounded', class: 'h-4 w-7 rounded' }
	};

	let dialogEl: HTMLDialogElement;
	let imageEl = $state<HTMLImageElement | null>(null);

	// Image state
	let imageUrl = $state('');
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let loaded = $state(false);

	// Transform state
	let scale = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);

	// Drag state
	let isDragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let initialOffsetX = 0;
	let initialOffsetY = 0;

	// Crop dimensions based on shape - use functions to get current values
	const getCropWidth = () => (shape === 'wide' || shape === 'wide-rounded' ? 320 : 280);
	const getCropHeight = () => (shape === 'wide' || shape === 'wide-rounded' ? 180 : 280);
	const CROP_WIDTH = $derived(getCropWidth());
	const CROP_HEIGHT = $derived(getCropHeight());
	const MIN_SCALE = 1;
	const MAX_SCALE = 3;

	// Track previous file to detect changes
	let previousFile: File | null = null;

	// Open dialog when file changes - using $effect.pre to run before render
	$effect.pre(() => {
		if (file && file !== previousFile) {
			previousFile = file;
			if (imageUrl) URL.revokeObjectURL(imageUrl);
			imageUrl = URL.createObjectURL(file);
			loaded = false;
			scale = 1;
			offsetX = 0;
			offsetY = 0;
			shape = defaultShape;
			dialogEl?.showModal();
		}
	});

	// Cleanup URL on unmount
	onDestroy(() => {
		if (imageUrl) URL.revokeObjectURL(imageUrl);
	});

	// Handle shape change - called directly from button click
	function selectShape(newShape: Shape) {
		if (newShape === shape) return;
		shape = newShape;
		// Reset scale/offset to fit in new dimensions if image is loaded
		if (loaded && naturalWidth && naturalHeight) {
			// Use setTimeout to let derived values update first
			setTimeout(() => resetToFit(), 0);
		}
	}

	// Function to reset scale/offset to fit image in crop area
	function resetToFit() {
		const scaleX = CROP_WIDTH / naturalWidth;
		const scaleY = CROP_HEIGHT / naturalHeight;
		scale = Math.min(scaleX, scaleY);

		const scaledWidth = naturalWidth * scale;
		const scaledHeight = naturalHeight * scale;
		offsetX = (CROP_WIDTH - scaledWidth) / 2;
		offsetY = (CROP_HEIGHT - scaledHeight) / 2;
	}

	function handleImageLoad() {
		if (!imageEl) return;
		naturalWidth = imageEl.naturalWidth;
		naturalHeight = imageEl.naturalHeight;
		resetToFit();
		loaded = true;
	}

	function handleMouseDown(e: MouseEvent) {
		if (!loaded) return;
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		initialOffsetX = offsetX;
		initialOffsetY = offsetY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;

		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		const newOffsetX = initialOffsetX + dx;
		const newOffsetY = initialOffsetY + dy;

		// Constrain within bounds (works for both larger and smaller images)
		const scaledWidth = naturalWidth * scale;
		const scaledHeight = naturalHeight * scale;

		const minX = Math.min(0, CROP_WIDTH - scaledWidth);
		const maxX = Math.max(0, CROP_WIDTH - scaledWidth);
		const minY = Math.min(0, CROP_HEIGHT - scaledHeight);
		const maxY = Math.max(0, CROP_HEIGHT - scaledHeight);

		offsetX = Math.max(minX, Math.min(maxX, newOffsetX));
		offsetY = Math.max(minY, Math.min(maxY, newOffsetY));
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		e.stopPropagation();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		updateScale(scale + delta);
	}

	// Action to attach wheel event with passive: false
	function wheelHandler(node: HTMLElement) {
		const handler = (e: WheelEvent) => handleWheel(e);
		node.addEventListener('wheel', handler, { passive: false });
		return {
			destroy() {
				node.removeEventListener('wheel', handler);
			}
		};
	}

	function updateScale(newScale: number) {
		if (!naturalWidth || !naturalHeight) return;

		// Calculate the center of the crop area in image coordinates
		const centerX = (CROP_WIDTH / 2 - offsetX) / scale;
		const centerY = (CROP_HEIGHT / 2 - offsetY) / scale;

		// Clamp scale - allow fitting full image
		const minScaleX = CROP_WIDTH / naturalWidth;
		const minScaleY = CROP_HEIGHT / naturalHeight;
		const minScaleToFit = Math.min(minScaleX, minScaleY);
		newScale = Math.max(minScaleToFit, Math.min(MAX_SCALE, newScale));

		// Update scale
		scale = newScale;

		// Adjust offset to keep the same point centered
		const scaledWidth = naturalWidth * scale;
		const scaledHeight = naturalHeight * scale;

		let newOffsetX = CROP_WIDTH / 2 - centerX * scale;
		let newOffsetY = CROP_HEIGHT / 2 - centerY * scale;

		// Constrain within bounds (works for both larger and smaller images)
		const minX = Math.min(0, CROP_WIDTH - scaledWidth);
		const maxX = Math.max(0, CROP_WIDTH - scaledWidth);
		const minY = Math.min(0, CROP_HEIGHT - scaledHeight);
		const maxY = Math.max(0, CROP_HEIGHT - scaledHeight);

		offsetX = Math.max(minX, Math.min(maxX, newOffsetX));
		offsetY = Math.max(minY, Math.min(maxY, newOffsetY));
	}

	function handleSliderInput(e: Event) {
		const target = e.target as HTMLInputElement;
		updateScale(parseFloat(target.value));
	}

	async function handleConfirm() {
		if (!loaded || !file || !imageEl) return;

		// Create canvas and crop
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Output size based on shape
		const outputWidth = isWideShape ? 1280 : 512;
		const outputHeight = isWideShape ? 720 : 512;
		canvas.width = outputWidth;
		canvas.height = outputHeight;

		// Calculate source rectangle in image coordinates
		const srcX = -offsetX / scale;
		const srcY = -offsetY / scale;
		const srcWidth = CROP_WIDTH / scale;
		const srcHeight = CROP_HEIGHT / scale;

		// Draw the cropped area
		ctx.drawImage(
			imageEl,
			srcX,
			srcY,
			srcWidth,
			srcHeight,
			0,
			0,
			outputWidth,
			outputHeight
		);

		// Convert to blob
		canvas.toBlob(
			(blob) => {
				if (blob) {
					const croppedFile = new File([blob], file.name, {
						type: 'image/jpeg',
						lastModified: Date.now()
					});
					onconfirm(croppedFile, shape);
					handleClose();
				}
			},
			'image/jpeg',
			0.9
		);
	}

	function handleClose() {
		dialogEl?.close();
		if (imageUrl) {
			URL.revokeObjectURL(imageUrl);
			imageUrl = '';
		}
		oncancel();
	}

	// Computed slider range - allow fitting full image
	const minScaleForSlider = $derived(
		naturalWidth && naturalHeight
			? Math.min(CROP_WIDTH / naturalWidth, CROP_HEIGHT / naturalHeight)
			: MIN_SCALE
	);
</script>

<svelte:window onmouseup={handleMouseUp} onmousemove={handleMouseMove} />

<dialog
	bind:this={dialogEl}
	class="fixed inset-0 m-auto h-fit w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
	onclose={handleClose}
>
	<div class="p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold">Crop Image</h2>
			<button onclick={handleClose} class="text-gray-400 hover:text-white" aria-label="Close">
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Crop area -->
		<div class="flex justify-center">
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="relative cursor-move overflow-hidden bg-gray-950 {shapeClass}"
				style="width: {CROP_WIDTH}px; height: {CROP_HEIGHT}px;"
				onmousedown={handleMouseDown}
				use:wheelHandler
				role="application"
				aria-label="Drag to position image, scroll to zoom"
			>
				{#if imageUrl}
					<img
						bind:this={imageEl}
						src={imageUrl}
						alt="Crop preview"
						class="pointer-events-none absolute select-none max-w-none"
						style="transform-origin: 0 0; transform: translate({offsetX}px, {offsetY}px) scale({scale});"
						onload={handleImageLoad}
						draggable="false"
					/>
				{/if}

				{#if !loaded}
					<div class="absolute inset-0 flex items-center justify-center">
						<div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-white"></div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Shape selector -->
		{#if shapes.length > 1}
			<div class="mt-4 flex justify-center gap-2">
				{#each shapes as opt (opt)}
					{@const config = shapeConfig[opt]}
					<button
						type="button"
						onclick={() => selectShape(opt)}
						class="flex h-10 w-10 items-center justify-center rounded-lg transition-colors {shape === opt ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
						aria-label={config.label}
						title={config.label}
					>
						<div class="{config.class} border-2 border-current"></div>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Zoom slider -->
		{#if loaded}
			<div class="mt-4 flex items-center gap-3">
				<svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
				</svg>
				<input
					type="range"
					min={minScaleForSlider}
					max={MAX_SCALE}
					step="0.01"
					value={scale}
					oninput={handleSliderInput}
					class="flex-1 accent-violet-500"
				/>
				<svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
				</svg>
			</div>
		{/if}

		<p class="mt-3 text-center text-xs text-gray-500">
			Drag to position, scroll or use slider to zoom
		</p>

		<!-- Actions -->
		<div class="mt-4 flex gap-2">
			<button
				onclick={handleClose}
				class="flex-1 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
			>
				Cancel
			</button>
			<button
				onclick={handleConfirm}
				disabled={!loaded}
				class="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
			>
				Apply
			</button>
		</div>
	</div>
</dialog>
