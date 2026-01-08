<script lang="ts">
	import { tick } from 'svelte';

	interface Props {
		value: string;
		onchange?: (color: string) => void;
		label?: string;
		open?: boolean;
		ontoggle?: (open: boolean) => void;
	}

	let { value = '#8b5cf6', onchange, label, open, ontoggle }: Props = $props();

	let wheelCanvas = $state<HTMLCanvasElement>();
	let squareCanvas = $state<HTMLCanvasElement>();
	let buttonEl: HTMLButtonElement;
	let internalOpen = $state(false);
	let popupPos = $state({ top: 0, left: 0 });

	// Use external control if provided, otherwise internal state
	const isOpen = $derived(open !== undefined ? open : internalOpen);

	function setOpen(newOpen: boolean) {
		if (newOpen && buttonEl) {
			const rect = buttonEl.getBoundingClientRect();
			popupPos = { top: rect.bottom + 8, left: rect.left };
		}
		if (ontoggle) {
			ontoggle(newOpen);
		} else {
			internalOpen = newOpen;
		}
	}
	let hue = $state(0);
	let saturation = $state(100);
	let lightness = $state(50);
	let hexInput = $state('');

	// Convert hex to HSL on value change
	$effect(() => {
		const hsl = hexToHsl(value);
		hue = hsl.h;
		saturation = hsl.s;
		lightness = hsl.l;
		hexInput = value;
	});

	// Draw canvases when popup opens
	$effect(() => {
		if (isOpen) {
			tick().then(() => {
				drawWheel();
				drawSquare();
			});
		}
	});

	// Redraw when hue changes
	$effect(() => {
		if (isOpen && wheelCanvas && squareCanvas) {
			// Track hue to trigger redraw
			const _h = hue;
			drawWheel();
			drawSquare();
		}
	});

	function hexToHsl(hex: string): { h: number; s: number; l: number } {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return { h: 0, s: 100, l: 50 };

		let r = parseInt(result[1], 16) / 255;
		let g = parseInt(result[2], 16) / 255;
		let b = parseInt(result[3], 16) / 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0;
		let s = 0;
		const l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
					break;
				case g:
					h = ((b - r) / d + 2) / 6;
					break;
				case b:
					h = ((r - g) / d + 4) / 6;
					break;
			}
		}

		return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
	}

	function hslToHex(h: number, s: number, l: number): string {
		s /= 100;
		l /= 100;
		const a = s * Math.min(l, 1 - l);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
			return Math.round(255 * color)
				.toString(16)
				.padStart(2, '0');
		};
		return `#${f(0)}${f(8)}${f(4)}`;
	}

	function drawWheel() {
		if (!wheelCanvas) return;
		const ctx = wheelCanvas.getContext('2d');
		if (!ctx) return;

		const size = 200;
		const centerX = size / 2;
		const centerY = size / 2;
		const outerRadius = size / 2 - 5;
		const innerRadius = outerRadius - 25;

		ctx.clearRect(0, 0, size, size);

		// Draw hue wheel
		for (let angle = 0; angle < 360; angle++) {
			const startAngle = ((angle - 1) * Math.PI) / 180;
			const endAngle = ((angle + 1) * Math.PI) / 180;

			ctx.beginPath();
			ctx.moveTo(
				centerX + innerRadius * Math.cos(startAngle),
				centerY + innerRadius * Math.sin(startAngle)
			);
			ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
			ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
			ctx.closePath();

			ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
			ctx.fill();
		}

		// Draw hue indicator
		const indicatorAngle = ((hue - 90) * Math.PI) / 180;
		const indicatorRadius = (outerRadius + innerRadius) / 2;
		ctx.beginPath();
		ctx.arc(
			centerX + indicatorRadius * Math.cos(indicatorAngle),
			centerY + indicatorRadius * Math.sin(indicatorAngle),
			8,
			0,
			Math.PI * 2
		);
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	function drawSquare() {
		if (!squareCanvas) return;
		const ctx = squareCanvas.getContext('2d');
		if (!ctx) return;

		const size = 140;
		ctx.clearRect(0, 0, size, size);

		// Draw saturation/lightness square
		for (let x = 0; x < size; x++) {
			for (let y = 0; y < size; y++) {
				const s = (x / size) * 100;
				const l = 100 - (y / size) * 100;
				ctx.fillStyle = `hsl(${hue}, ${s}%, ${l}%)`;
				ctx.fillRect(x, y, 1, 1);
			}
		}

		// Draw indicator
		const indicatorX = (saturation / 100) * size;
		const indicatorY = ((100 - lightness) / 100) * size;
		ctx.beginPath();
		ctx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 3;
		ctx.stroke();
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	function handleWheelClick(e: MouseEvent) {
		if (!wheelCanvas) return;
		const rect = wheelCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left - 100;
		const y = e.clientY - rect.top - 100;
		const angle = Math.atan2(y, x);
		hue = Math.round(((angle * 180) / Math.PI + 90 + 360) % 360);
		updateColor();
		drawWheel();
		drawSquare();
	}

	function handleSquareClick(e: MouseEvent) {
		if (!squareCanvas) return;
		const rect = squareCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(140, e.clientX - rect.left));
		const y = Math.max(0, Math.min(140, e.clientY - rect.top));
		saturation = Math.round((x / 140) * 100);
		lightness = Math.round(100 - (y / 140) * 100);
		updateColor();
		drawSquare();
	}

	function updateColor() {
		const newHex = hslToHex(hue, saturation, lightness);
		hexInput = newHex;
		onchange?.(newHex);
	}

	function handleHexInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let hex = input.value;
		if (!hex.startsWith('#')) hex = '#' + hex;
		if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
			const hsl = hexToHsl(hex);
			hue = hsl.h;
			saturation = hsl.s;
			lightness = hsl.l;
			onchange?.(hex);
			drawWheel();
			drawSquare();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.color-wheel-container')) {
			setOpen(false);
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="color-wheel-container relative">
	{#if label}
		<span class="mb-2 block text-sm text-gray-400">{label}</span>
	{/if}

	<button
		bind:this={buttonEl}
		type="button"
		onclick={() => setOpen(!isOpen)}
		class="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/50 px-2 py-1.5 transition-colors hover:border-gray-500"
	>
		<div class="h-5 w-5 rounded" style="background-color: {value}"></div>
		<span class="font-mono text-xs text-gray-400">{value}</span>
	</button>

	{#if isOpen}
		<div
			class="fixed z-[100] rounded-xl border border-gray-600 bg-gray-900 p-4 shadow-2xl"
			style="top: {popupPos.top}px; left: {popupPos.left}px;"
		>
			<div class="flex gap-4">
				<!-- Hue Wheel -->
				<canvas
					bind:this={wheelCanvas}
					width="200"
					height="200"
					class="h-[200px] w-[200px] cursor-crosshair"
					onclick={handleWheelClick}
					onmousedown={(e) => {
						const move = (ev: MouseEvent) => handleWheelClick(ev);
						const up = () => {
							window.removeEventListener('mousemove', move);
							window.removeEventListener('mouseup', up);
						};
						window.addEventListener('mousemove', move);
						window.addEventListener('mouseup', up);
						handleWheelClick(e);
					}}
				></canvas>

				<div class="flex flex-col gap-3">
					<!-- Saturation/Lightness Square -->
					<canvas
						bind:this={squareCanvas}
						width="140"
						height="140"
						class="h-[140px] w-[140px] cursor-crosshair rounded"
						onclick={handleSquareClick}
						onmousedown={(e) => {
							const move = (ev: MouseEvent) => handleSquareClick(ev);
							const up = () => {
								window.removeEventListener('mousemove', move);
								window.removeEventListener('mouseup', up);
							};
							window.addEventListener('mousemove', move);
							window.addEventListener('mouseup', up);
							handleSquareClick(e);
						}}
					></canvas>

					<!-- Lightness Slider -->
					<div>
						<input
							type="range"
							min="0"
							max="100"
							bind:value={lightness}
							oninput={updateColor}
							class="h-2 w-full cursor-pointer appearance-none rounded-lg"
							style="background: linear-gradient(to right, #000, hsl({hue}, {saturation}%, 50%), #fff)"
						/>
					</div>

					<!-- Hex Input -->
					<div>
						<label for="hex-input" class="mb-1 block text-xs text-gray-400">Hex</label>
						<input
							id="hex-input"
							type="text"
							bind:value={hexInput}
							oninput={handleHexInput}
							class="w-full rounded border border-gray-600 bg-gray-800 p-2 font-mono text-sm text-white focus:border-[var(--theme-primary)] focus:outline-none"
							maxlength="7"
						/>
					</div>
				</div>
			</div>

			<!-- Preview -->
			<div class="mt-3 flex items-center gap-3">
				<div class="h-10 flex-1 rounded-lg" style="background-color: {hexInput}"></div>
			</div>
		</div>
	{/if}
</div>
