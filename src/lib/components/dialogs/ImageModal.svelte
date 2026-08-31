<script lang="ts" module>
  /**
   * The frame a crop is taken in.
   *
   * Proportions and corners are separate choices, so they're separate controls:
   * one list of both made 'square' and 'rounded' look like alternatives, when a
   * square is rounded or it isn't. They're still emitted as a single `Shape`,
   * because that's what callers store and render from.
   *
   * In a module script because these are exported — an `export function` in an
   * instance script is a component accessor, not a module export.
   */
  export type Shape =
    | 'circle'
    | 'rounded'
    | 'square'
    | 'portrait'
    | 'portrait-rounded'
    | 'wide'
    | 'wide-rounded';

  /** What proportions the crop is taken in. */
  export type Aspect = 'circle' | 'square' | 'portrait' | 'landscape';

  export function toShape(aspect: Aspect, rounded: boolean): Shape {
    if (aspect === 'circle') return 'circle';
    if (aspect === 'square') return rounded ? 'rounded' : 'square';
    if (aspect === 'portrait') return rounded ? 'portrait-rounded' : 'portrait';
    return rounded ? 'wide-rounded' : 'wide';
  }

  export function fromShape(shape: Shape): { aspect: Aspect; rounded: boolean } {
    switch (shape) {
      case 'circle':
        return { aspect: 'circle', rounded: true };
      case 'rounded':
        return { aspect: 'square', rounded: true };
      case 'square':
        return { aspect: 'square', rounded: false };
      case 'portrait':
        return { aspect: 'portrait', rounded: false };
      case 'portrait-rounded':
        return { aspect: 'portrait', rounded: true };
      case 'wide':
        return { aspect: 'landscape', rounded: false };
      case 'wide-rounded':
        return { aspect: 'landscape', rounded: true };
    }
  }
</script>

<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import ToggleSwitch from '$lib/components/ui/ToggleSwitch.svelte';

  interface Props {
    file: File | null;
    aspects?: Aspect[];
    defaultShape?: Shape;
    onconfirm: (croppedFile: File, shape: Shape) => void;
    oncancel: () => void;
  }

  let {
    file,
    aspects = ['circle', 'square', 'portrait', 'landscape'],
    defaultShape = 'rounded',
    onconfirm,
    oncancel
  }: Props = $props();

  /*
   * Read once. The effect below re-seeds both whenever a new file arrives,
   * which is the only time the starting frame should change — reacting to the
   * prop as well would reset the frame mid-crop.
   */
  let aspect = $state<Aspect>(untrack(() => fromShape(defaultShape).aspect));
  let rounded = $state(untrack(() => fromShape(defaultShape).rounded));

  // A circle is round by definition, so the toggle has nothing to say about it.
  const shape = $derived<Shape>(toShape(aspect, aspect === 'circle' ? true : rounded));

  /*
   * What gets written, per shape. Bigger than the frame on screen, which is
   * only a viewport — the file should stand up on a retina display and as a
   * share image.
   */
  const OUTPUT_SIZES: Record<Aspect, { w: number; h: number }> = {
    circle: { w: 512, h: 512 },
    square: { w: 512, h: 512 },
    portrait: { w: 1024, h: 1280 },
    landscape: { w: 1280, h: 720 }
  };

  const shapeClass = $derived(
    aspect === 'circle' ? 'rounded-full' : rounded ? 'rounded-2xl' : 'rounded-none'
  );

  /*
   * Each icon is the shape it selects, exaggerated a little so square and
   * portrait aren't a two-pixel difference at this size.
   */
  const aspectConfig: Record<Aspect, { label: string; class: string }> = {
    circle: { label: 'Circle', class: 'h-4 w-4 rounded-full' },
    square: { label: 'Square', class: 'h-4 w-4 rounded-[2px]' },
    portrait: { label: 'Portrait', class: 'h-5 w-3.5 rounded-[2px]' },
    landscape: { label: 'Landscape', class: 'h-3 w-5 rounded-[2px]' }
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

  /*
   * The frame's proportions, per shape. Landscape and portrait are both normal
   * for a poster or a banner — a square-only crop meant choosing which half of
   * a wide photo to lose.
   */
  const CROP_SIZES: Record<Aspect, { w: number; h: number }> = {
    circle: { w: 280, h: 280 },
    square: { w: 280, h: 280 },
    portrait: { w: 224, h: 280 },
    landscape: { w: 320, h: 180 }
  };

  const getCropWidth = () => CROP_SIZES[aspect].w;
  const getCropHeight = () => CROP_SIZES[aspect].h;
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
      const initial = fromShape(defaultShape);
      aspect = initial.aspect;
      rounded = initial.rounded;
      dialogEl?.showModal();
    }
  });

  // Cleanup URL on unmount
  onDestroy(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  });

  /**
   * Changing proportions re-fits the image, since the frame it has to fill is
   * a different shape. Rounding doesn't — it's only the corners.
   */
  function selectAspect(next: Aspect) {
    if (next === aspect) return;
    aspect = next;
    if (loaded && naturalWidth && naturalHeight) {
      // Let the derived crop dimensions update before measuring against them.
      setTimeout(() => resetToFit(), 0);
    }
  }

  /**
   * Start with the crop frame filled, not with the whole image inside it.
   *
   * `Math.max` is cover; `Math.min` was contain, which left the rest of the
   * canvas untouched. Nothing paints a background, so that empty area is
   * transparent — and transparency flattens to black the moment it's written
   * as JPEG. A landscape photo cropped square came back with black bars baked
   * into the file.
   *
   * Cropping is for choosing part of an image. Keeping all of it is what
   * `noCrop` is for.
   */
  function resetToFit() {
    const scaleX = CROP_WIDTH / naturalWidth;
    const scaleY = CROP_HEIGHT / naturalHeight;
    scale = Math.max(scaleX, scaleY);

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

    // Can't zoom out past a filled frame, or the gap becomes black on save.
    const minScaleX = CROP_WIDTH / naturalWidth;
    const minScaleY = CROP_HEIGHT / naturalHeight;
    const minScaleToCover = Math.max(minScaleX, minScaleY);
    newScale = Math.max(minScaleToCover, Math.min(MAX_SCALE, newScale));

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

    const { w: outputWidth, h: outputHeight } = OUTPUT_SIZES[aspect];
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Calculate source rectangle in image coordinates
    const srcX = -offsetX / scale;
    const srcY = -offsetY / scale;
    const srcWidth = CROP_WIDTH / scale;
    const srcHeight = CROP_HEIGHT / scale;

    // Draw the cropped area
    ctx.drawImage(imageEl, srcX, srcY, srcWidth, srcHeight, 0, 0, outputWidth, outputHeight);

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
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
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
            class="pointer-events-none absolute max-w-none select-none"
            style="transform-origin: 0 0; transform: translate({offsetX}px, {offsetY}px) scale({scale});"
            onload={handleImageLoad}
            draggable="false"
          />
        {/if}

        {#if !loaded}
          <div class="absolute inset-0 flex items-center justify-center">
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-white"
            ></div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Shape selector -->
    {#if aspects.length > 1}
      <div class="mt-5 flex flex-wrap items-center justify-center gap-4">
        <!-- A segmented control: these are four values of one property, so
             they share a track rather than floating as separate buttons. -->
        <div class="flex items-center gap-1 rounded-lg bg-gray-800 p-1">
          {#each aspects as opt (opt)}
            {@const config = aspectConfig[opt]}
            <button
              type="button"
              onclick={() => selectAspect(opt)}
              class="flex h-8 w-8 items-center justify-center rounded-md transition-colors {aspect ===
              opt
                ? 'bg-violet-600 text-white'
                : 'text-gray-500 hover:bg-gray-700 hover:text-gray-200'}"
              aria-label={config.label}
              aria-pressed={aspect === opt}
              title={config.label}
            >
              <div class="{config.class} border-2 border-current"></div>
            </button>
          {/each}
        </div>

        <!-- Rounding is a different property, so it gets the switch the rest of
             the admin uses rather than a fifth thing that looks like an aspect.
             Absent for a circle, which has nothing to round. -->
        {#if aspect !== 'circle'}
          <ToggleSwitch checked={rounded} label="Rounded" onchange={(v) => (rounded = v)} />
        {/if}
      </div>
    {/if}

    <!-- Zoom slider -->
    {#if loaded}
      <div class="mt-4 flex items-center gap-3">
        <svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
          />
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
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
          />
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
