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
  }

  let {
    source = null,
    heading = 'Get the next one first',
    blurb = 'An email when there’s something new. Nothing else.',
    disabled = false
  }: Props = $props();

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
  class="w-full rounded-lg border border-white/10 p-4"
  style="background-color: var(--color-card)"
>
  {#if status === 'done'}
    <p class="text-center text-sm" aria-live="polite">You’re on the list.</p>
  {:else}
    <h2 class="text-sm font-medium">{heading}</h2>
    <p class="mt-0.5 text-xs" style="color: var(--color-text-muted)">{blurb}</p>

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
        class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm placeholder-white/30 focus:border-white/25 focus:outline-none"
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
        class="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
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
