<script lang="ts">
  import { onMount, tick } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

  /**
   * Page views over a window, against the same window before it.
   *
   * A component rather than markup on the stats page, because the dashboard
   * shows the same chart and a second copy of a hundred lines of uPlot options
   * is how the two quietly stop matching.
   */
  let {
    viewsByDay,
    previousViewsByDay,
    days = 30,
    height = 200,
    locale = 'nb-NO'
  }: {
    viewsByDay: { date: string; count: number }[];
    previousViewsByDay: { date: string; count: number }[];
    days?: number;
    height?: number;
    /** The site's language, so dates read the way the rest of the admin does. */
    locale?: string;
  } = $props();

  let chartContainer: HTMLDivElement;
  let chart: uPlot | null = null;

  function createChart() {
    if (!chartContainer) return;
    if (chartContainer.clientWidth === 0) return;

    // Every day in the window, so a day with no views is a zero rather than a
    // gap the line skips over.
    const now = new Date();
    const allDates: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      allDates.push(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000);
    }

    const currentMap = new Map<string, number>();
    for (const d of viewsByDay) {
      currentMap.set(d.date, d.count);
    }

    const previousMap = new Map<string, number>();
    for (const d of previousViewsByDay) {
      previousMap.set(d.date, d.count);
    }

    const currentValues: number[] = [];
    const previousValues: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const currentDate = new Date(now);
      currentDate.setDate(currentDate.getDate() - i);
      const currentKey = currentDate.toISOString().split('T')[0];
      currentValues.push(currentMap.get(currentKey) ?? 0);

      // The same weekday one window back, so the comparison lines up.
      const prevDate = new Date(currentDate);
      prevDate.setDate(prevDate.getDate() - days);
      const prevKey = prevDate.toISOString().split('T')[0];
      previousValues.push(previousMap.get(prevKey) ?? 0);
    }

    const allValues = [...currentValues, ...previousValues];
    const maxValue = Math.max(...allValues, 10);

    const opts: uPlot.Options = {
      width: chartContainer.clientWidth,
      height,
      class: 'uplot-chart',
      padding: [10, 10, 0, 0],
      cursor: {
        show: true,
        points: { show: true }
      },
      scales: {
        x: { time: true },
        y: {
          min: 0,
          max: maxValue
        }
      },
      axes: [
        {
          stroke: '#6b7280',
          grid: { stroke: '#374151', width: 1 },
          ticks: { stroke: '#374151' },
          font: '10px system-ui',
          /*
           * The locale's own ordering, not a hardcoded day/month — that was an
           * assumption about which language was in use, and it read backwards
           * for anyone whose does it the other way round.
           */
          values: (_, ticks) => {
            const format = new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'numeric'
            });
            return ticks.map((t) => format.format(new Date(t * 1000)));
          }
        },
        {
          stroke: '#6b7280',
          grid: { stroke: '#374151', width: 1, dash: [4, 4] },
          ticks: { stroke: '#374151' },
          font: '10px system-ui',
          size: 40
        }
      ],
      series: [
        {
          /*
           * uPlot writes its own date here otherwise, in its own format and its
           * own idea of a locale. This is the readout under the cursor, so it's
           * the date somebody actually reads off the chart.
           */
          label: 'Day',
          value: (_, timestamp) =>
            timestamp == null
              ? '--'
              : new Intl.DateTimeFormat(locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short'
                }).format(new Date(timestamp * 1000))
        },
        {
          label: 'This period',
          stroke: '#8b5cf6',
          width: 1,
          fill: 'rgba(139, 92, 246, 0.15)',
          paths: uPlot.paths.spline?.(),
          points: { show: false }
        },
        {
          label: 'Previous 30 days',
          stroke: '#60a5fa',
          width: 1,
          dash: [6, 4],
          paths: uPlot.paths.spline?.(),
          points: { show: false }
        }
      ]
    };

    if (chart) {
      chart.destroy();
    }

    const chartData: uPlot.AlignedData = [
      new Float64Array(allDates),
      new Float64Array(currentValues),
      new Float64Array(previousValues)
    ];
    chart = new uPlot(opts, chartData, chartContainer);
  }

  onMount(() => {
    tick().then(() => {
      createChart();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (chart && chartContainer) {
        chart.setSize({ width: chartContainer.clientWidth, height });
      }
    });

    if (chartContainer) {
      resizeObserver.observe(chartContainer);
    }

    return () => {
      resizeObserver.disconnect();
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });

  // Rebuild when the numbers or the language change — the formatters are baked
  // into the options, so a new locale needs a new chart.
  $effect(() => {
    viewsByDay;
    previousViewsByDay;
    locale;
    if (chartContainer) {
      tick().then(() => createChart());
    }
  });
</script>

<!-- Thirty days squeezed into a phone's width is a smear, so the chart keeps a
     readable day spacing and the container scrolls to it instead. uPlot sizes
     itself from this element, so the floor is set here and the ResizeObserver
     picks it up. -->
<div class="-mx-1 overflow-x-auto px-1">
  <div bind:this={chartContainer} class="w-full min-w-[34rem]"></div>
</div>

<!--
  uPlot ships a stylesheet written for a white page, so its legend came out
  black on black. The chart's own colours are set in the options above; this is
  the part uPlot renders as DOM, and it can only be reached from CSS.

  Here rather than on the page, which is where it used to live. Component styles
  load with the page that declares them, so a rule written on the stats page did
  nothing for the dashboard — and the same chart was tidy on one screen and
  unreadable on the other. The options moved into this component for exactly
  that reason; the styles should have come with them.

  `:global` because the elements belong to uPlot, not to this component, so
  Svelte's scoping would drop the rules as unused. Everything hangs off the
  chart's own class — set in the options above — because uPlot's stylesheet
  carries rules of the same specificity from a different file, and which of two
  equally specific rules wins would otherwise come down to load order.
-->
<style>
  :global(.uplot-chart) {
    background: transparent;
  }

  :global(.uplot-chart .u-legend) {
    color: var(--color-gray-400, #9ca3af);
    font-size: 0.75rem;
  }

  /* The series rows sit in a table; its borders are drawn for a light page. */
  :global(.uplot-chart .u-legend .u-marker) {
    border-width: 2px;
  }

  /*
   * It doubles as the readout under the cursor, so the value has to be legible
   * rather than merely present — it's the only way to read a given day.
   */
  :global(.uplot-chart .u-legend .u-value) {
    color: var(--color-gray-100, #f3f4f6);
    font-variant-numeric: tabular-nums;
  }

  /* Dimmed rather than hidden when a series is switched off, so it's clear the
     row is still there to switch back on. */
  :global(.uplot-chart .u-legend .u-off > *) {
    opacity: 0.4;
  }
</style>
