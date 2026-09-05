<script lang="ts">
  /**
   * Sign-up for the fan list, for the public side of the site.
   *
   * Its own component rather than part of the release page: a shop or an about
   * page will want the same block, and the honeypot and result handling are
   * the parts you don't want copied to get them.
   */
  interface Props {
    /** Recorded against the subscriber, so you can tell where a list came from. */
    source?: string | null;
    heading?: string;
    blurb?: string;
    /** True in the admin preview, where submitting would be a real sign-up. */
    disabled?: boolean;
    /**
     * Which surface it's sitting on.
     *
     * `card` is the release page, where everything is an outlined panel the
     * colour of the card and this has to look like the buttons above it.
     * `soft` is a block on an ordinary page, where the shows, releases and shop
     * all draw themselves as a tinted round-cornered panel with no border —
     * an outlined box among those reads as a form bolted onto the page.
     */
    surface?: 'card' | 'soft';
  }

  let {
    source = null,
    heading = 'Get the next one first',
    blurb = 'An email when there’s something new. Nothing else.',
    disabled = false,
    surface = 'card'
  }: Props = $props();

  const soft = $derived(surface === 'soft');

  let email = $state('');
  let website = $state(''); // honeypot — hidden from people, filled by bots
  let status = $state<'idle' | 'sending' | 'done' | 'error'>('idle');
  let message = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (disabled || status === 'sending' || !email) return;

    status = 'sending';
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Falls back to the page it's rendered on, so a block dropped on any
        // page records where the sign-up came from without being told.
        body: JSON.stringify({
          email,
          source: source ?? (location.pathname.replace(/^\//, '') || 'home'),
          website
        })
      });
      const result = await response.json();

      if (result.success) {
        status = 'done';
      } else {
        status = 'error';
        message = result.message ?? 'That didn’t go through.';
      }
    } catch {
      status = 'error';
      message = 'That didn’t go through. Try again in a moment.';
    }
  }
</script>

<section
  class="w-full {soft ? 'rounded-2xl bg-white/5 p-5' : 'rounded-lg border border-white/10 p-4'}"
  style={soft ? '' : 'background-color: var(--color-card)'}
>
  {#if status === 'done'}
    <p class="flex items-center justify-center gap-2 text-center text-sm" aria-live="polite">
      <svg
        class="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style="color: var(--color-accent)"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      You’re on the list.
    </p>
  {:else}
    <!-- The envelope earns its place on a page full of blocks: it's what tells
         you at a glance that this one is the list rather than another row of
         links. -->
    <div class="flex items-start gap-3">
      {#if soft}
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style="background: color-mix(in srgb, var(--color-accent) 18%, transparent)"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style="color: var(--color-accent)"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
      {/if}
      <div class="min-w-0">
        <h2 class="{soft ? 'text-base' : 'text-sm'} font-semibold" style="color: var(--color-text)">
          {heading}
        </h2>
        <p class="mt-0.5 text-xs" style="color: var(--color-text-muted)">{blurb}</p>
      </div>
    </div>

    <form class="mt-3 flex gap-2" onsubmit={submit}>
      <label class="sr-only" for="fan-email">Email address</label>
      <input
        id="fan-email"
        type="email"
        required
        autocomplete="email"
        placeholder="you@example.com"
        bind:value={email}
        {disabled}
        class="min-w-0 flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm placeholder-white/30 focus:border-white/25 focus:outline-none {soft
          ? 'bg-black/25'
          : 'bg-black/20'}"
      />

      <!-- Hidden from people, offered to bots. Not `type=hidden`: the point is
           that something filling every field it finds fills this one too. -->
      <input
        type="text"
        name="website"
        tabindex="-1"
        autocomplete="off"
        aria-hidden="true"
        bind:value={website}
        class="pointer-events-none absolute h-0 w-0 opacity-0"
      />

      <button
        type="submit"
        disabled={disabled || status === 'sending' || !email}
        class="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-50"
        style="background-color: var(--color-accent); color: var(--color-bg)"
      >
        {status === 'sending' ? 'Adding…' : 'Sign up'}
      </button>
    </form>

    {#if status === 'error'}
      <p class="mt-2 text-xs text-red-400" aria-live="polite">{message}</p>
    {/if}
  {/if}
</section>
