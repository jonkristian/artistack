<script lang="ts">
  /**
   * The clip as a post, rather than as a sheet of text.
   *
   * The post sheet answers "what do I paste where"; this answers the question
   * you actually have before sending something out — what will people see. Two
   * things it shows that no amount of markdown can:
   *
   * - **The first frame.** Every platform grabs it as the cover, and a clip
   *   that opens on black posts as a black tile. You cannot tell from a list
   *   of fields; you can tell at a glance from this.
   *
   * A still, not a player. The picture above the timeline is where a clip is
   * watched, and two players on one screen is two things to pause. This only
   * has to answer what the post looks like sitting in a feed.
   * - **The fold.** Captions are cut after a line or two behind "more", and
   *   which words survive that cut is most of whether anyone taps it.
   *
   * Deliberately not a pixel-exact copy of any one app. Close enough to read
   * the clip the way a stranger will, and honest about being an approximation
   * — a frame that claimed to be Instagram would be wrong by next month and
   * would invite people to tune a layout we don't control.
   */
  import { captionText } from '$lib/clips/caption-html';

  let {
    poster,
    aspect,
    name,
    description,
    tags = []
  }: {
    /** The render's cover — the frame platforms will use as the tile. */
    poster: string | null;
    /** The clip's shape, so a square or landscape clip is previewed as one. */
    aspect: string;
    name: string;
    description: string;
    tags?: string[];
  } = $props();

  /**
   * Where the caption is cut.
   *
   * A hundred and twenty-five characters is the shortest of the common folds —
   * Instagram's — so previewing against it is previewing against the worst
   * case. Cut on a word, because no platform cuts mid-word and a preview that
   * did would make the fold look worse than it is.
   */
  const FOLD = 125;

  const words = $derived(captionText(description).trim());
  /*
   * Hashtags are part of the caption, not a field beside it.
   *
   * That is where they go on every platform this posts to, and it is why they
   * matter here: they are counted against the fold like any other words, so a
   * long tag list can push the sentence you wanted read behind "more". The
   * post sheet lists them separately because it is a reference; this is a
   * likeness, and a likeness has to spend the same characters.
   */
  const hashtags = $derived(tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' '));
  const full = $derived([words, hashtags].filter(Boolean).join('\n\n'));

  const cut = $derived.by(() => {
    if (full.length <= FOLD) return { shown: full, hidden: '' };
    const at = full.lastIndexOf(' ', FOLD);
    const stop = at > FOLD - 40 ? at : FOLD;
    return { shown: full.slice(0, stop), hidden: full.slice(stop).trim() };
  });

  let open = $state(false);

  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(full);
    copied = true;
    // Says so on the button rather than raising a toast: the thing you pressed
    // is the thing that should answer.
    setTimeout(() => (copied = false), 1400);
  }
</script>

<div class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
  <!-- Whose post it is. The name only: a handle is a thing each platform
       issues and this is all of them at once. -->
  <div class="flex items-center gap-2 px-3 py-2">
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-[11px] font-semibold text-gray-200"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
    <span class="min-w-0 flex-1 truncate text-xs font-medium text-gray-200">{name}</span>
    <!-- The caption, exactly as shown, for pasting into whatever is posting it
         by hand. This replaced a whole post sheet: the sheet listed title,
         tags, hashtags and link as separate fields, and the only one anybody
         ever took from it was the caption. -->
    <button
      type="button"
      onclick={copy}
      disabled={!full}
      title="Copy the caption"
      class="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  </div>

  <!-- The frame, in the clip's own shape. Black behind it, because that is
       what a platform shows around a clip that doesn't fill its slot — and
       because a first frame of black should look like what it is. -->
  <div class="relative w-full bg-black" style="aspect-ratio: {aspect}">
    {#if poster}
      <img src={poster} alt="" class="h-full w-full object-contain" />
      <!-- Scenery, not a control.
           A feed draws one over a video and it is most of what makes a still
           read as a clip rather than a photo. It does nothing on purpose:
           watching happens in the pane above, and a play button that played
           would be a second thing on screen to pause. `pointer-events-none`
           so it can't even be pressed by accident. -->
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          class="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-[2px]"
        >
          <svg class="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
    {:else}
      <div class="flex h-full w-full items-center justify-center px-6 text-center">
        <p class="text-xs text-gray-500">
          Render the clip to see the cover frame and how the post reads.
        </p>
      </div>
    {/if}
  </div>

  <!-- The caption, cut where a platform cuts it. -->
  <div class="px-3 py-2.5">
    {#if full}
      <p class="text-xs leading-relaxed whitespace-pre-line text-gray-300">
        <span class="font-medium text-gray-100">{name}</span>
        {cut.shown}{#if cut.hidden}{#if open}<span class="whitespace-pre-line"
              >{' ' + cut.hidden}</span
            >{/if}<button
            type="button"
            onclick={() => (open = !open)}
            class="ml-0.5 text-gray-500 hover:text-gray-300">{open ? ' less' : '… more'}</button
          >{/if}
      </p>
      {#if cut.hidden}
        <p class="mt-1.5 text-[11px] text-gray-500">
          {cut.hidden.length} characters sit behind “more”.
        </p>
      {/if}
    {:else}
      <p class="text-xs text-gray-500">No description yet — the post would have no caption.</p>
    {/if}
  </div>
</div>
