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
    locale = 'nb-NO',
    legendTarget = null
  }: {
    viewsByDay: { date: string; count: number }[];
    previousViewsByDay: { date: string; count: number }[];
    days?: number;
    height?: number;
    /** The site's language, so dates read the way the rest of the admin does. */
    locale?: string;
    /**
     * Somewhere else to put the legend — the card's header, usually.
     *
     * uPlot's `legend.mount` exists for this, so the element is placed where it
     * is built rather than moved afterwards. It's also the cursor readout, the
     * figures changing as you move across the chart, which is why it's this
     * element that travels rather than a copy of it.
     */
    legendTarget?: HTMLElement | null;
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
      /*
       * Marked with a class of its own as it's built, and styled through that
       * rather than through the chart it came from.
       *
       * The styles below used to hang off `.uplot-chart .u-legend`, which reads
       * fine until the legend is mounted somewhere else — a descendant selector
       * stops matching the moment its ancestor isn't above it any more, and the
       * legend came out in uPlot's own black-on-white. A class on the element
       * travels with it.
       */
      legend: {
        mount: (self: uPlot, el: HTMLElement) => {
          el.classList.add('chart-legend');
          if (legendTarget) {
            el.classList.add('chart-legend-inline');
            legendTarget.replaceChildren(el);
          } else {
            // What uPlot would have done if we hadn't taken the job.
            self.root.appendChild(el);
          }
        }
      },
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

  :global(.chart-legend) {
    color: var(--color-gray-400, #9ca3af);
    font-size: 0.75rem;
  }

  /* The series rows sit in a table; its borders are drawn for a light page. */
  :global(.chart-legend .u-marker) {
    border-width: 2px;
  }

  /*
   * It doubles as the readout under the cursor, so the value has to be legible
   * rather than merely present — it's the only way to read a given day.
   */
  :global(.chart-legend .u-value) {
    color: var(--color-gray-100, #f3f4f6);
    font-variant-numeric: tabular-nums;
  }

  /*
   * In a header it has to read as one line of keys rather than a stacked table,
   * so the rows become inline cells. Only when it's been mounted out of the
   * chart — under the plot the table layout is the right one.
   */
  :global(.chart-legend-inline) {
    display: inline-flex;
    align-items: center;
    gap: 0.9rem;
    margin: 0;
  }

  /*
   * The rows are a table, and a table's baseline isn't the text baseline of
   * whatever sits beside it — which is why this didn't line up with the link
   * next to it. `display: contents` takes the table box out of the way so the
   * series become flex children of the legend itself.
   */
  :global(.chart-legend-inline tbody) {
    display: contents;
  }

  :global(.chart-legend-inline .u-series) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
  }

  /* The marker is an empty bordered box with no baseline of its own. */
  :global(.chart-legend-inline .u-series th) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0;
  }

  :global(.chart-legend-inline .u-series td) {
    display: inline;
    padding: 0;
  }

  /*
   * Not on a phone, wherever it's mounted.
   *
   * It's a key and a hover readout, and a touch screen has no hover — so on a
   * narrow screen it's three labels reading "--" taking a line from the chart
   * they describe. 640px is Tailwind's `sm`, which is where the rest of the
   * admin changes shape too.
   */
  @media (max-width: 639px) {
    :global(.chart-legend) {
      display: none;
    }
  }

  /* Dimmed rather than hidden when a series is switched off, so it's clear the
     row is still there to switch back on. */
  :global(.chart-legend .u-off > *) {
    opacity: 0.4;
  }
</style>
