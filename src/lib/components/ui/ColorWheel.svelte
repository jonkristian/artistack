<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { openPopover } from './Popover.svelte';
  import Slider from './Slider.svelte';

  interface Props {
    value: string;
    onchange?: (color: string) => void;
    label?: string;
    open?: boolean;
    ontoggle?: (open: boolean) => void;
    /**
     * The colours already kept, offered as one click each.
     *
     * A wheel is the right control for finding a colour and the wrong one for
     * using the same colour again: matching a sleeve's yellow by eye, twice, on
     * two different screens, gets you two yellows.
     */
    swatches?: string[];
    /** Keeps the current colour, or drops it. Only the screen that owns the shelf passes this. */
    onkeep?: (color: string) => void;
    /**
     * Ways out of picking a colour: inheriting one, or having none.
     *
     * A list rather than a flag each, because which of them a control has
     * depends on what it colours — text can be automatic, a panel can be
     * automatic or absent, and a site's background can be neither.
     */
    actions?: { label: string; onclick: () => void }[];
    /**
     * A number that belongs with the colour, shown under the wheel.
     *
     * Some colours have a size: a border has a width, a glow has a radius.
     * They are one decision — nobody sets a border's colour without a thought
     * about how heavy it is — and splitting them puts a stray number field
     * next to a swatch, which reads as two settings that happen to be
     * adjacent. Absent for every colour that is only a colour.
     */
    /**
     * How see-through the colour is, 0–100, when that is part of it.
     *
     * Distinct from `amount` below, which is a number that merely travels with
     * a colour — a border's weight, a glow's radius. This one *is* the colour,
     * so it is drawn inside the wheel and the preview shows the result rather
     * than the opaque version of it.
     */
    alpha?: {
      value: number;
      onchange: (percent: number) => void;
      label?: string;
    };
    amount?: {
      label: string;
      value: number;
      min: number;
      max: number;
      step?: number;
      /** What the number is in, said once beside it. */
      hint?: string;
      onchange: (value: number) => void;
    };
    /** Just the swatch, no hex beside it — for a control with no room to say it twice. */
    compact?: boolean;
    /**
     * What this colour is for.
     *
     * A bare swatch in a toolbar says a colour is settable and not *which*
     * colour: three of them side by side are the words, the panel behind them
     * and the ring around them, and nothing on screen says so.
     */
    title?: string;
    /** The trigger's own classes, for surfaces that don't look like a form. */
    triggerClass?: string;
    /**
     * Classes for the wrapper the trigger sits in.
     *
     * It exists to anchor the popup and to catch clicks outside it, and it was
     * doing a third thing nobody asked for: standing between the trigger and
     * the row the trigger was supposed to line up with. Whatever the trigger
     * does about its own height, it does it against this div and not against
     * the row — so this has to be told how to sit in the row itself.
     */
    rootClass?: string;
    /**
     * What the button looks like, when a bare swatch isn't enough of a label.
     *
     * A square of colour says which colour and not what it colours, which is
     * fine in a row of six under the words Background and Panels, and useless
     * beside four other buttons on a caption. Given a snippet, the caller draws
     * its own — an icon with the colour under it, the way every editor has
     * drawn a text colour since about 1995.
     */
    trigger?: Snippet<[{ value: string; none: boolean }]>;
  }

  let {
    value = '#8b5cf6',
    onchange,
    label,
    open,
    ontoggle,
    swatches = [],
    onkeep,
    alpha,
    actions = [],
    amount,
    compact = false,
    title,
    trigger,
    rootClass = '',
    triggerClass = 'flex items-center gap-2 rounded border border-gray-700 bg-gray-800/50 px-2 py-1.5 transition-colors hover:border-gray-500'
  }: Props = $props();

  /** The grey chequerboard everything transparent is read against. */
  const CHEQUER =
    'background-image: linear-gradient(45deg, #52525b 25%, transparent 25%),' +
    ' linear-gradient(-45deg, #52525b 25%, transparent 25%),' +
    ' linear-gradient(45deg, transparent 75%, #52525b 75%),' +
    ' linear-gradient(-45deg, transparent 75%, #52525b 75%);' +
    ' background-size: 10px 10px;' +
    ' background-position: 0 0, 0 5px, 5px -5px, -5px 0px;' +
    ' background-color: #27272a;';

  /** Whether the colour on screen is one of the kept ones, which decides what Keep says. */
  const kept = $derived(swatches.some((c) => c.toLowerCase() === value.toLowerCase()));

  /*
   * Whether there is a colour at all.
   *
   * Anything that isn't a hex is "none" — the swatch draws a line through
   * itself instead of a colour, and the wheel opens on a sensible one rather
   * than on nothing. It's a state the control can hold, not a caller's problem:
   * "no panel" is as much an answer as a green one.
   */
  const none = $derived(!/^#[0-9a-f]{6}$/i.test(value));

  let wheelCanvas = $state<HTMLCanvasElement>();
  let squareCanvas = $state<HTMLCanvasElement>();
  let buttonEl: HTMLButtonElement;
  let popupEl = $state<HTMLDivElement>();
  let internalOpen = $state(false);
  let popupPos = $state({ top: 0, left: 0 });

  // Use external control if provided, otherwise internal state
  const isOpen = $derived(open !== undefined ? open : internalOpen);

  /**
   * Puts the panel where it fits, rather than always below and to the right.
   *
   * It is `fixed`, so it is placed against the window and not against whatever
   * it opens out of — which is what lets it escape a scroller like the clip
   * timeline, and also what let it hang off the bottom of the screen when the
   * swatch that opened it was already near the edge. Below if there's room,
   * above if there isn't, and clamped into the window either way.
   *
   * The size is measured when the panel exists and guessed the first time,
   * because the first placement happens in the same breath as the decision to
   * show it. The effect below runs it again once it's real.
   */
  function placePopup() {
    if (!buttonEl) return;

    const rect = buttonEl.getBoundingClientRect();
    const gap = 8;
    const width = popupEl?.offsetWidth ?? 420;
    const height = popupEl?.offsetHeight ?? 380;

    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - gap) top = rect.top - gap - height;
    top = Math.max(gap, Math.min(top, window.innerHeight - height - gap));

    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
    popupPos = { top, left };
  }

  /** This wheel, for the one-popover-at-a-time rule. */
  const token = Symbol('colour wheel');

  function setOpen(newOpen: boolean) {
    if (newOpen) {
      placePopup();
      // Opening takes the floor, which closes whichever wheel had it.
      openPopover.claim(token);
    } else {
      openPopover.release(token);
    }

    if (ontoggle) {
      ontoggle(newOpen);
    } else {
      internalOpen = newOpen;
    }
  }

  /*
   * Closes when another one opens.
   *
   * The rule lives here rather than in the screens that use it: two wheels
   * open at once is two controls both claiming to be the thing you are
   * setting, whatever the screen happens to be.
   */
  $effect(() => {
    if (isOpen && !openPopover.holds(token)) setOpen(false);
  });

  // Nothing is holding the floor on behalf of a wheel that has gone.
  $effect(() => () => openPopover.release(token));
  let hue = $state(0);
  let saturation = $state(100);
  let lightness = $state(50);
  let hexInput = $state('');

  // Convert hex to HSL on value change. `hexToHsl` already answers with a
  // middling violet for anything it can't read, which is what "none" needs the
  // wheel to open on.
  $effect(() => {
    const hsl = hexToHsl(value);
    hue = hsl.h;
    saturation = hsl.s;
    lightness = hsl.l;
    hexInput = value;
  });

  // Draw canvases when popup opens, and place it now its size is known
  $effect(() => {
    if (isOpen) {
      tick().then(() => {
        placePopup();
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
    /*
     * The same angle the ring was painted at.
     *
     * The ring above lays hue 0 at 3 o'clock and walks clockwise, so the
     * marker has to read the same way. It used to turn a quarter first, which
     * put the dot on cyan while the colour was magenta.
     */
    const indicatorAngle = (hue * Math.PI) / 180;
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
    hue = Math.round(((angle * 180) / Math.PI + 360) % 360);
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

  /** What the dials currently add up to, shown here and nowhere else yet. */
  function paintColor() {
    hexInput = hslToHex(hue, saturation, lightness);
  }

  function updateColor() {
    paintColor();
    onchange?.(hexInput);
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

<div class="color-wheel-container relative {rootClass}">
  {#if label}
    <span class="mb-2 block text-sm text-gray-400">{label}</span>
  {/if}

  <button
    bind:this={buttonEl}
    type="button"
    onclick={() => setOpen(!isOpen)}
    {title}
    aria-label={title}
    class={triggerClass}
  >
    {#if trigger}
      {@render trigger({ value, none })}
    {:else}
      <!-- An empty square when there is no colour, and the word beside it says
           so. It used to draw a line through itself as well, which was one
           statement too many and the only crude mark on the control. -->
      <div
        class="h-5 w-5 rounded {none ? 'border border-dashed border-gray-500' : ''}"
        style={none ? '' : `background-color: ${value}`}
      ></div>
      {#if !compact}
        <span class="font-mono text-xs text-gray-400">{none ? 'None' : value}</span>
      {/if}
    {/if}
  </button>

  {#if isOpen}
    <div
      bind:this={popupEl}
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
              oninput={paintColor}
              onchange={updateColor}
              class="h-2 w-full cursor-pointer appearance-none rounded-lg"
              style="background: linear-gradient(to right, #000, hsl({hue}, {saturation}%, 50%), #fff)"
            />
          </div>

          <!-- How see-through it is.
               Part of the colour, not a number next to it: a white panel at
               half strength is grey, and a control that shows you white while
               the picture shows you grey is the colour not being the colour.
               Over a chequerboard, the way every editor draws transparency,
               with the colour's own gradient on top of it. -->
          {#if alpha}
            <div>
              <div class="mb-1 flex items-baseline justify-between text-xs text-gray-400">
                <span>{alpha.label ?? 'Opacity'}</span>
                <span class="tabular-nums">{Math.round(alpha.value)}%</span>
              </div>
              <div class="rounded" style={CHEQUER}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={alpha.value}
                  aria-label={alpha.label ?? 'Opacity'}
                  class="h-2 w-full cursor-pointer appearance-none rounded-lg"
                  style="background: linear-gradient(to right, transparent, {hexInput})"
                  oninput={(e) => alpha?.onchange(Number(e.currentTarget.value))}
                />
              </div>
            </div>
          {/if}

          <!-- Hex Input -->
          <div>
            <label for="hex-input" class="mb-1 block text-xs text-gray-400">Hex</label>
            <input
              id="hex-input"
              type="text"
              bind:value={hexInput}
              oninput={handleHexInput}
              class="w-full rounded border border-gray-600 bg-gray-800 p-2 font-mono text-sm text-gray-50 focus:border-[var(--theme-primary)] focus:outline-none"
              maxlength="7"
            />
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="mt-3 flex items-center gap-3">
        <div class="h-10 flex-1 rounded-lg" style={alpha ? CHEQUER : ''}>
          <div
            class="h-full w-full rounded-lg"
            style="background-color: {hexInput}; opacity: {alpha ? alpha.value / 100 : 1}"
          ></div>
        </div>
      </div>

      <!-- The size that goes with the colour, when the colour has one. Under
           the preview, so you can see what the number does to what you just
           picked. -->
      {#if amount}
        <div class="mt-3 flex items-center gap-3 border-t border-gray-700 pt-3">
          <span class="min-w-0 flex-1 truncate text-xs text-gray-400">{amount.label}</span>
          <Slider
            value={amount.value}
            min={amount.min}
            max={amount.max}
            step={amount.step ?? 1}
            label={amount.label}
            class="w-28"
            onchange={(next) => amount?.onchange(next)}
          />
          <span class="w-10 shrink-0 text-right text-xs text-gray-400 tabular-nums">
            {amount.value}{amount.hint ?? ''}
          </span>
        </div>
      {/if}

      <!-- The shelf. Above the wheel would put it in the way of the thing it's
           an alternative to; under the preview it reads as "or one of these". -->
      {#if swatches.length > 0 || onkeep || actions.length > 0}
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-700 pt-3">
          {#each swatches as swatch (swatch)}
            <button
              type="button"
              title={swatch}
              aria-label="Use {swatch}"
              onclick={() => onchange?.(swatch)}
              class="h-6 w-6 rounded border transition-transform hover:scale-110 {swatch.toLowerCase() ===
              value.toLowerCase()
                ? 'border-white'
                : 'border-gray-600'}"
              style="background-color: {swatch}"
            ></button>
          {/each}

          {#if onkeep}
            <button
              type="button"
              onclick={() => onkeep?.(value)}
              class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800"
            >
              {kept ? 'Forget' : 'Keep'}
            </button>
          {/if}

          {#each actions as action, i (action.label)}
            <button
              type="button"
              onclick={() => {
                action.onclick();
                setOpen(false);
              }}
              class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-800 {i ===
              0
                ? 'ml-auto'
                : ''}"
            >
              {action.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
