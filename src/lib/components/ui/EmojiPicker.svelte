<script lang="ts">
  /**
   * The 😀 button and the grid behind it.
   *
   * Its own component because the emoji are wanted in places formatting isn't:
   * a post caption goes to TikTok as plain text and a meta description goes
   * into an attribute, so neither can carry the rich editor — but both are
   * places people reach for an emoji, and typing one on a desktop keyboard is
   * a trip through an OS picker.
   *
   * Hands back the character and nothing else. Where it lands — a TipTap
   * document, a textarea's cursor — is the caller's business.
   */
  let {
    onpick,
    align = 'right'
  }: {
    onpick: (emoji: string) => void;
    /** Which edge the grid hangs from, so it can't open off the panel. */
    align?: 'left' | 'right';
  } = $props();

  const emojis = [
    '😀',
    '😂',
    '🥰',
    '😎',
    '🤘',
    '🎵',
    '🎶',
    '🎸',
    '🎤',
    '🎧',
    '🔥',
    '✨',
    '💫',
    '⭐',
    '❤️',
    '💜',
    '💙',
    '🖤',
    '🤍',
    '💛',
    '👏',
    '🙌',
    '✌️',
    '🤙',
    '👋',
    '🎉',
    '🎊',
    '💪',
    '🌟',
    '🌍'
  ];

  let open = $state(false);

  function pick(emoji: string) {
    onpick(emoji);
    open = false;
  }
</script>

<div class="relative">
  <button
    type="button"
    onclick={() => (open = !open)}
    class="rounded px-2 py-0.5 text-xs transition-colors {open
      ? 'bg-gray-600 text-white'
      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}"
    aria-label="Emoji"
    aria-expanded={open}
  >
    😀
  </button>
  {#if open}
    <div
      class="absolute z-10 mt-1 grid w-56 grid-cols-10 gap-0.5 rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-lg {align ===
      'right'
        ? 'right-0'
        : 'left-0'}"
    >
      {#each emojis as emoji (emoji)}
        <button
          type="button"
          onclick={() => pick(emoji)}
          class="rounded p-0.5 text-base hover:bg-gray-700"
        >
          {emoji}
        </button>
      {/each}
    </div>
  {/if}
</div>
