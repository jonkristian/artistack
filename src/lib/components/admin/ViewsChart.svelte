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
    height = 200
  }: {
    viewsByDay: { date: string; count: number }[];
    previousViewsByDay: { date: string; count: number }[];
    days?: number;
    height?: number;
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
          values: (_, ticks) =>
            ticks.map((t) => {
              const d = new Date(t * 1000);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            })
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
        {},
        {
          label: 'This period',
          stroke: '#8b5cf6',
          width: 1,
          fill: 'rgba(139, 92, 246, 0.15)',
          paths: uPlot.paths.spline?.(),
          points: { show: false }
        },
        {
          label: 'Previous period',
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

  // Rebuild when the numbers change.
  $effect(() => {
    viewsByDay;
    previousViewsByDay;
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
<div class="mt-3 flex items-center gap-6 text-xs text-gray-400">
  <div class="flex items-center gap-2">
    <span class="h-0.5 w-4 bg-purple-500"></span>
    <span>This period</span>
  </div>
  <div class="flex items-center gap-2">
    <span class="h-0.5 w-4 border-t-2 border-dashed border-blue-400"></span>
    <span>Previous 30 days</span>
  </div>
</div>
