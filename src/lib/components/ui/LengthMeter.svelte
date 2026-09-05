<script lang="ts">
  /**
   * How much of what's been typed will actually be seen.
   *
   * Some fields have two budgets and no way to eyeball either — a meta
   * description is cut around 160 characters by a search result and around 200
   * by a link preview; a post caption folds after a line and is refused after
   * a couple of thousand. Neither is a rule anyone can enforce, and the text
   * goes on looking fine in the box long after most of it has stopped reaching
   * anybody, which is exactly the kind of thing a field should say for itself.
   *
   * The bar fills to the first mark and the two marks name themselves: what
   * they mean is the caller's to say, since this only counts characters.
   *
   * Not a limit. Nothing is truncated or refused here: going long is a
   * trade-off, and the writer is the one who should make it.
   */
  let {
    value = '',
    limit,
    hard,
    hint = '',
    softHint = '',
    hardHint = '',
    split = false
  }: {
    value?: string | null;
    /** Where the first thing stops showing all of it. */
    limit: number;
    /** Where the last thing does. */
    hard: number;
    /** What the field says when the length isn't worth mentioning. */
    hint?: string;
    /**
     * What passing each mark means, in the caller's own words. A search result
     * and a post caption are cut by different things for different reasons, and
     * a component counting characters is in no position to say which.
     */
    softHint?: string;
    hardHint?: string;
    /**
     * Give each mark half the bar.
     *
     * For two numbers of the same order — 160 and 200 — one scale shows both.
     * For a caption's 100 and 2,200 it can't: on a bar drawn to the cap the
     * fold sits four percent along and may as well not be there, and on a bar
     * drawn to the fold everything past it is pinned at the end. Split, the
     * left half counts to the fold and the right half runs from there to the
     * cap, so both are somewhere you can see.
     */
    split?: boolean;
  } = $props();

  const length = $derived((value ?? '').trim().length);

  const state = $derived(length > hard ? 'hard' : length > limit ? 'soft' : 'fine');

  /*
   * Unsplit, the bar fills to the first mark and stops there — past it the
   * colour is what carries the message, and a bar that kept growing would need
   * a scale nobody asked for.
   */
  const fill = $derived.by(() => {
    if (!split) return Math.min(100, limit === 0 ? 0 : (length / limit) * 100);
    if (length <= limit) return limit === 0 ? 0 : (length / limit) * 50;
    if (length >= hard) return 100;
    return 50 + ((length - limit) / (hard - limit)) * 50;
  });

  /**
   * Which mark the count is read against.
   *
   * Past the fold, "146 / 100" reads as an overrun of something that isn't one.
   * The number that matters from there on is the cap.
   */
  const against = $derived(split && length > limit ? hard : limit);

  /*
   * Split, the halves are coloured separately: the first stays as it was,
   * because that part of the caption is doing its job whatever comes after,
   * and only what runs past the fold takes the warning colour. Recolouring the
   * whole bar said the whole thing had gone wrong, when what had happened was
   * that some of it had gone past a mark.
   */
  const barColor = $derived(
    split
      ? 'bg-violet-500'
      : { fine: 'bg-violet-500', soft: 'bg-amber-400', hard: 'bg-red-400' }[state]
  );

  /** How much of the bar the first half accounts for. */
  const baseFill = $derived(split ? Math.min(fill, 50) : fill);

  /** What's beyond the fold, drawn from the middle out. */
  const overFill = $derived(split ? Math.max(0, fill - 50) : 0);

  const overColor = $derived(state === 'hard' ? 'bg-red-400' : 'bg-amber-400');

  const countColor = $derived(
    { fine: 'text-gray-500', soft: 'text-amber-400', hard: 'text-red-400' }[state]
  );

  const message = $derived(
    state === 'hard' ? hardHint || softHint || hint : state === 'soft' ? softHint || hint : hint
  );
</script>

<div class="relative mt-1.5 h-1 overflow-hidden rounded-full bg-gray-800">
  <div
    class="h-full rounded-full transition-all duration-200 {barColor}"
    style="width: {baseFill}%"
  ></div>
  <!-- Square-ended, and clipped by the track's own rounding: this segment
       starts in the middle of the bar, so a rounded left edge would leave a
       notch against the half before it. -->
  {#if overFill > 0}
    <div
      class="absolute inset-y-0 left-1/2 transition-all duration-200 {overColor}"
      style="width: {overFill}%"
    ></div>
  {/if}
  <!-- Where the halves meet, so the fold is a place on the bar rather than
       something you only find out about by crossing it. -->
  {#if split}
    <div class="absolute inset-y-0 left-1/2 w-px bg-gray-950/80"></div>
  {/if}
</div>

<p class="mt-1 flex items-baseline justify-between gap-3 text-xs text-gray-500">
  <span>{message}</span>
  <span class="shrink-0 tabular-nums {countColor}">{length} / {against}</span>
</p>
