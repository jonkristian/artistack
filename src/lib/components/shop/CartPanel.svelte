<script lang="ts">
  import { formatPrice } from '$lib/utils/price';
  import { toast } from '$lib/stores/toast.svelte';
  import * as cart from '$lib/stores/cart.svelte';
  import { page } from '$app/state';
  import { withVariant } from '$lib/utils/variants';
  import {
    checkoutOptions,
    startCheckout,
    orderReceipt
  } from '../../../routes/shop/checkout.remote';
  import { addressSuggestions, addressDetails } from '../../../routes/shop/address.remote';

  /**
   * The basket, the form and the receipt, in a window over the basket button.
   *
   * Three views rather than three pages. Buying a t-shirt shouldn't navigate
   * you away from what you came to look at, and every step of it back again is
   * a step someone can drop out of.
   *
   * A panel above the button on a desktop, a sheet up from the bottom on a
   * phone. Same markup either way: at 375px an anchored popover is the full
   * width of the screen anyway, so it may as well be the shape a thumb expects.
   */
  let { locale = 'nb-NO' }: { locale?: string } = $props();

  const open = $derived(cart.isOpen());
  const view = $derived(cart.currentView());
  const lines = $derived(cart.getLines());

  /*
   * Asked for when the panel opens, not on every page load. Most visitors never
   * open it, and it would otherwise be a settings read for the whole site.
   */
  const options = $derived(open ? checkoutOptions() : null);

  /** An order named in the address, after coming back from paying. */
  const reference = $derived(page.url.searchParams.get('order'));
  const receipt = $derived(reference ? orderReceipt(reference) : null);

  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let addressLine = $state('');
  let postcode = $state('');
  let city = $state('');
  let country = $state('');
  let note = $state('');
  let provider = $state('');
  let paying = $state(false);
  /*
   * Default on. Not consent — an existing customer can be written to about
   * similar goods without it — so this is a chance to decline rather than a box
   * that manufactures agreement. Nothing happens with it unless the payment
   * goes through, because the exemption is about customers.
   */
  let marketingOptIn = $state(true);

  /*
   * The address details, once something has filled them in.
   *
   * A picked suggestion answers postcode, city and country in one go, so asking
   * for them again as three empty boxes is asking a question that's already
   * been answered. They're shown as a line instead, with a way back to the
   * inputs — a lookup can be switched off, get a flat number wrong, or simply
   * not know a new build.
   */
  const addressResolved = $derived(postcode.trim() !== '' && city.trim() !== '');
  let manualAddress = $state(false);
  let showNote = $state(false);

  const needsAddress = $derived(options?.current?.needsAddress ?? false);
  const addressLookup = $derived(options?.current?.addressLookup ?? false);
  /** No fan list, no offer to join it. */
  const audience = $derived(options?.current?.audience ?? false);
  const providers = $derived(options?.current?.providers ?? []);
  const problem = $derived(options?.current?.problem ?? null);

  // Pre-picked when there's only one, because choosing between one thing isn't
  // a choice — it's a step.
  $effect(() => {
    if (provider === '' && providers.length > 0) provider = providers[0].id;
  });

  /**
   * What's stopping the payment, in the order someone would fill it in.
   *
   * A disabled button with no explanation is a dead end — the reason it can't
   * be pressed is always something the person can fix, so it may as well say
   * so.
   */
  const missing = $derived.by(() => {
    if (problem) return null;
    if (name.trim() === '') return 'Add your name';
    if (email.trim() === '') return 'Add your email';
    if (needsAddress) {
      if (addressLine.trim() === '') return 'Add your address';
      if (postcode.trim() === '' || city.trim() === '') return 'Add a postcode and city';
    }
    if (provider === '') return 'Choose how to pay';
    return null;
  });

  const ready = $derived(
    !problem &&
      provider !== '' &&
      name.trim() !== '' &&
      email.trim() !== '' &&
      (!needsAddress || (addressLine.trim() !== '' && postcode.trim() !== '' && city.trim() !== ''))
  );

  async function pay(event: SubmitEvent) {
    event.preventDefault();
    if (paying || !ready) return;

    paying = true;
    try {
      const { url } = await startCheckout({
        provider,
        // Where to come back to. The provider takes the browser off this site
        // entirely, so the panel can only reopen if the page it was over says
        // which order it belongs to.
        from: page.url.pathname,
        name,
        email,
        phone: phone || null,
        addressLine: addressLine || null,
        postcode: postcode || null,
        city: city || null,
        country: country || null,
        note: note || null,
        marketingOptIn: audience && marketingOptIn
      });
      // A full navigation, not a client one: this leaves the site.
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the payment');
      paying = false;
    }
  }

  /*
   * Address suggestions.
   *
   * Debounced rather than fired per keystroke: every call is billed, and a
   * seven-letter street would otherwise cost seven lookups to answer one
   * question. Three characters is the floor — shorter than that matches half of
   * Norway and tells nobody anything.
   */
  let suggestions = $state<{ id: string; description: string }[]>([]);
  let lookupTimer: ReturnType<typeof setTimeout> | null = null;
  /** Rises on each request; a slow earlier reply is discarded rather than shown. */
  let lookupToken = 0;

  function onAddressInput() {
    if (!addressLookup) return;
    if (lookupTimer) clearTimeout(lookupTimer);

    const typed = addressLine.trim();
    if (typed.length < 3) {
      suggestions = [];
      return;
    }

    lookupTimer = setTimeout(async () => {
      const token = ++lookupToken;
      try {
        const found = await addressSuggestions(typed);
        if (token === lookupToken) suggestions = found;
      } catch {
        // A lookup that fails leaves a perfectly good text field behind, so
        // there is nothing worth interrupting anyone about.
        if (token === lookupToken) suggestions = [];
      }
    }, 300);
  }

  /**
   * Leaving the address field having typed something no suggestion answered.
   *
   * At that point they aren't using the lookup, so the postcode and city have
   * to be asked for — they're required, and until they arrive the Pay button
   * can't do anything. Waiting for blur rather than reacting to each keystroke
   * keeps the form still while someone is choosing.
   *
   * The suggestions cancel their own mousedown, so this no longer fires while
   * one is being clicked and doesn't have to race it. The short delay stays for
   * touch, where the order of blur and tap is less dependable.
   */
  function onAddressBlur() {
    setTimeout(() => {
      suggestions = [];
      if (addressLine.trim() !== '' && !addressResolved) manualAddress = true;
    }, 200);
  }

  async function chooseAddress(id: string) {
    suggestions = [];
    try {
      const found = await addressDetails(id);
      addressLine = found.addressLine ?? addressLine;
      postcode = found.postcode ?? postcode;
      city = found.city ?? city;
      country = found.country ?? country;
      // Answered, so fold the inputs away again if they were open.
      manualAddress = false;
    } catch {
      toast.error('Could not fill that address in — type it instead');
    }
  }

  const field =
    'w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:ring-2';
  const fieldStyle =
    'background-color: var(--color-well); color: var(--color-text); border: 1px solid var(--color-line);';
  const label = 'mb-1 block text-xs tracking-wide uppercase';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && cart.closeCart()} />

{#if open}
  <!--
    Closes on a click outside, which is what everyone tries first.

    Dimmed on a phone, where the sheet covers most of the screen and the page
    behind it is gone anyway — and invisible on a desktop, where this is a small
    window in a corner and dimming the whole site to show it would be a much
    louder gesture than the one being made.
  -->
  <div
    class="fixed inset-0 z-40 bg-black/60 sm:bg-transparent"
    role="presentation"
    onclick={() => cart.closeCart()}
  ></div>

  <div
    class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-4 sm:bottom-20 sm:max-h-[min(70vh,34rem)] sm:w-96 sm:rounded-2xl"
    style="background-color: var(--color-surface); border-color: var(--color-line)"
    role="dialog"
    aria-modal="true"
    aria-label="Basket"
  >
    <header
      class="flex items-center justify-between gap-3 border-b px-4 py-3"
      style="border-color: var(--color-line)"
    >
      <!-- Back rather than close, when there's somewhere behind. Leaving the
           form shouldn't mean leaving the basket. -->
      {#if view === 'checkout'}
        <button
          type="button"
          onclick={() => cart.showView('basket')}
          class="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
          style="color: var(--color-text-muted)"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Basket
        </button>
      {:else}
        <h2 class="text-sm font-semibold tracking-wider uppercase" style="color: var(--color-text)">
          {view === 'receipt' ? 'Your order' : 'Basket'}
        </h2>
      {/if}

      <button
        type="button"
        onclick={() => cart.closeCart()}
        class="p-1 transition-opacity hover:opacity-70"
        style="color: var(--color-text-muted)"
        aria-label="Close"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      {#if view === 'receipt'}
        {#if receipt?.current}
          {@const order = receipt.current}
          <div class="flex flex-col gap-4">
            <div>
              <p class="text-base font-medium" style="color: var(--color-text)">
                {order.paid ? 'Thank you' : 'Nothing was charged'}
              </p>
              <p class="mt-1 text-sm" style="color: var(--color-text-muted)">
                {order.paid
                  ? 'The order went through. A receipt is on its way.'
                  : 'The payment did not complete. Your basket is still here.'}
              </p>
            </div>

            <p class="text-xs tracking-wider uppercase" style="color: var(--color-text-muted)">
              {order.reference}
            </p>

            <ul class="flex flex-col gap-2">
              {#each order.items as item (`${item.name}:${item.variant ?? ''}`)}
                <li class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate" style="color: var(--color-text)">
                    {item.quantity} × {withVariant(item.name, item.variant)}
                  </span>
                  <span class="shrink-0 tabular-nums" style="color: var(--color-text-muted)">
                    {formatPrice(item.unitPrice * item.quantity, order.currency, locale)}
                  </span>
                </li>
              {/each}
            </ul>

            <!-- The files, straight away. A download that arrives by email an
                 hour later is a download people email you about. -->
            {#each order.items.filter((i) => i.downloadUrl) as item (item.name)}
              <a
                href={item.downloadUrl}
                class="rounded-lg px-4 py-3 text-center text-sm font-medium transition-opacity hover:opacity-90"
                style="background: var(--color-accent); color: var(--color-on-accent)"
              >
                Download {item.name}
              </a>
            {/each}

            {#if order.paid && order.items.some((i) => i.type === 'physical')}
              <p class="text-sm" style="color: var(--color-text-muted)">
                {order.city
                  ? `Going out to ${order.city}. You'll hear when it's posted.`
                  : "You'll hear when it's posted."}
              </p>
            {/if}
          </div>
        {:else}
          <p class="text-sm" style="color: var(--color-text-muted)">Looking up that order…</p>
        {/if}
      {:else if lines.length === 0}
        <p class="py-8 text-center text-sm" style="color: var(--color-text-muted)">
          Nothing in the basket yet.
        </p>
      {:else if view === 'basket'}
        <ul class="flex flex-col gap-3">
          {#each lines as line (`${line.productId}:${line.variant}`)}
            <li class="flex items-center gap-3">
              {#if line.imageUrl}
                <img
                  src={line.imageUrl}
                  alt=""
                  class="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              {/if}
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm" style="color: var(--color-text)">
                  {withVariant(line.name, line.variant)}
                </p>
                <p class="text-xs tabular-nums" style="color: var(--color-text-muted)">
                  {formatPrice((line.price ?? 0) * line.quantity, line.currency, locale)}
                </p>
              </div>
              <div
                class="flex shrink-0 items-center gap-1 rounded-lg px-1"
                style="background-color: var(--color-well)"
              >
                <button
                  onclick={() => cart.setQuantity(line.productId, line.quantity - 1, line.variant)}
                  disabled={cart.busyWith() != null}
                  class="h-7 w-7 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
                  style="color: var(--color-text)"
                  aria-label="One fewer {withVariant(line.name, line.variant)}"
                >
                  −
                </button>
                <span class="text-xs tabular-nums" style="color: var(--color-text)">
                  {line.quantity}
                </span>
                <button
                  onclick={() => cart.setQuantity(line.productId, line.quantity + 1, line.variant)}
                  disabled={cart.busyWith() != null ||
                    (line.stock != null && line.quantity >= line.stock)}
                  class="h-7 w-7 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
                  style="color: var(--color-text)"
                  aria-label="One more {withVariant(line.name, line.variant)}"
                >
                  +
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <!-- The form. Reached from the basket, with the basket still behind it,
             so nobody has to remember what they were buying. -->
        <form id="checkout-form" onsubmit={pay} class="flex flex-col gap-4">
          <div>
            <label for="cart-name" class={label} style="color: var(--color-text-muted)">Name</label>
            <input id="cart-name" bind:value={name} class={field} style={fieldStyle} required />
          </div>
          <div>
            <label for="cart-email" class={label} style="color: var(--color-text-muted)">
              Email
            </label>
            <input
              id="cart-email"
              type="email"
              bind:value={email}
              class={field}
              style={fieldStyle}
              required
            />

            <!--
              Ticked by default, which is allowed here and wouldn't be for a
              stranger: markedsføringsloven § 15 lets a seller write to a buyer
              about similar goods without prior consent, so long as they were
              given a plain chance to decline when the address was taken. This
              is that chance, and it has to stay plain — beside the field, not
              buried under the Pay button.
            -->
            {#if audience}
              <label class="mt-2.5 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  bind:checked={marketingOptIn}
                  class="mt-0.5 h-4 w-4 shrink-0 rounded"
                  style="accent-color: var(--color-accent)"
                />
                <span class="text-xs" style="color: var(--color-text-muted)">
                  Tell me about new releases and merch. One click to stop, any time.
                </span>
              </label>
            {/if}
          </div>

          <!-- Only when there's something to post. A download has no
               destination, and asking would be collecting an address for
               nothing. -->
          {#if needsAddress}
            <div class="relative">
              <label for="cart-address" class={label} style="color: var(--color-text-muted)">
                Address
              </label>
              <input
                id="cart-address"
                bind:value={addressLine}
                oninput={onAddressInput}
                onblur={onAddressBlur}
                autocomplete="street-address"
                class={field}
                style={fieldStyle}
                required
              />

              <!--
                Suggestions swallow their own mousedown, so the field never
                loses focus and blur never fires while one is being clicked.

                The old approach — close on blur after 150ms — raced the click.
                Blur happens on mousedown, so anyone who read the list before
                pressing, rather than stabbing at it, had the option removed
                from under the cursor and their click landed on nothing.
              -->
              {#if suggestions.length > 0}
                <ul
                  class="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
                  style="background-color: var(--color-surface); border-color: var(--color-line)"
                >
                  {#each suggestions as suggestion (suggestion.id)}
                    <li>
                      <button
                        type="button"
                        onmousedown={(e) => e.preventDefault()}
                        onclick={() => chooseAddress(suggestion.id)}
                        class="block w-full px-3 py-2 text-left text-sm transition-opacity hover:opacity-70"
                        style="color: var(--color-text)"
                      >
                        {suggestion.description}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}

              <!--
                Inside the field's own element, not beside it: this is what the
                lookup came back with and the way to overrule it, so it belongs
                to the input the way the hint under Email does. As a sibling it
                picked up the form's gap and floated halfway to the next field.
              -->
              {#if addressResolved && !manualAddress}
                <div class="mt-1.5 flex items-baseline justify-between gap-3">
                  <p class="min-w-0 truncate text-xs" style="color: var(--color-text-muted)">
                    {[postcode, city, country].filter(Boolean).join(' ')}
                  </p>
                  <button
                    type="button"
                    onclick={() => (manualAddress = true)}
                    class="shrink-0 text-xs underline transition-opacity hover:opacity-70"
                    style="color: var(--color-text-muted)"
                  >
                    Change
                  </button>
                </div>
              {:else if addressLookup && !manualAddress}
                <button
                  type="button"
                  onclick={() => (manualAddress = true)}
                  class="mt-1.5 text-xs underline transition-opacity hover:opacity-70"
                  style="color: var(--color-text-muted)"
                >
                  Can't find it? Enter the address yourself
                </button>
              {/if}
            </div>

            {#if manualAddress || !addressLookup}
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="cart-postcode" class={label} style="color: var(--color-text-muted)">
                    Postcode
                  </label>
                  <input
                    id="cart-postcode"
                    bind:value={postcode}
                    class={field}
                    style={fieldStyle}
                    required
                  />
                </div>
                <div>
                  <label for="cart-city" class={label} style="color: var(--color-text-muted)">
                    City
                  </label>
                  <input
                    id="cart-city"
                    bind:value={city}
                    class={field}
                    style={fieldStyle}
                    required
                  />
                </div>
              </div>
              <div>
                <label for="cart-country" class={label} style="color: var(--color-text-muted)">
                  Country
                </label>
                <input id="cart-country" bind:value={country} class={field} style={fieldStyle} />
              </div>
            {/if}

            <div>
              <label for="cart-phone" class={label} style="color: var(--color-text-muted)">
                Phone
              </label>
              <input
                id="cart-phone"
                type="tel"
                bind:value={phone}
                class={field}
                style={fieldStyle}
                placeholder="Optional — some couriers ask for one"
              />
            </div>
          {/if}

          <!-- Behind a link. Sizes are a real field now, so the note is
               genuinely occasional rather than the workaround it used to be. -->
          {#if showNote}
            <div>
              <label for="cart-note" class={label} style="color: var(--color-text-muted)">
                Note
              </label>
              <textarea
                id="cart-note"
                bind:value={note}
                rows="2"
                class={field}
                style={fieldStyle}
                placeholder="Who to sign it to, anything else worth knowing…"
              ></textarea>
            </div>
          {:else}
            <button
              type="button"
              onclick={() => (showNote = true)}
              class="self-start text-xs underline transition-opacity hover:opacity-70"
              style="color: var(--color-text-muted)"
            >
              Add a note
            </button>
          {/if}

          {#if providers.length > 1}
            <div>
              <span class={label} style="color: var(--color-text-muted)">Pay with</span>
              <div class="flex flex-wrap gap-2">
                {#each providers as option (option.id)}
                  <button
                    type="button"
                    onclick={() => (provider = option.id)}
                    class="rounded-lg px-3 py-2 text-sm transition-opacity hover:opacity-90"
                    style={provider === option.id
                      ? 'background: var(--color-accent); color: var(--color-on-accent)'
                      : fieldStyle}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </form>
      {/if}
    </div>

    <!-- The total and the way on, pinned rather than scrolled to: on a phone
         the form is taller than the panel, and a Pay button below it is a
         button people scroll past looking for. -->
    {#if view !== 'receipt' && lines.length > 0}
      <footer class="border-t px-4 py-3" style="border-color: var(--color-line)">
        <div class="mb-3 flex items-baseline justify-between">
          <span class="text-sm" style="color: var(--color-text-muted)">Total</span>
          <span class="font-medium tabular-nums" style="color: var(--color-text)">
            {formatPrice(cart.getTotal(), cart.currency(), locale)}
          </span>
        </div>

        {#if problem}
          <p
            class="mb-3 rounded-lg px-3 py-2 text-xs"
            style="background-color: color-mix(in srgb, #ef4444 15%, transparent); color: var(--color-text)"
          >
            {problem}
          </p>
        {/if}

        {#if view === 'basket'}
          {#if providers.length === 0 && options?.current}
            <p
              class="rounded-lg px-3 py-2.5 text-center text-xs"
              style="background-color: var(--color-well); color: var(--color-text-muted)"
            >
              No payment method is set up yet — get in touch and we'll sort it out directly.
            </p>
          {:else}
            <button
              type="button"
              onclick={() => cart.showView('checkout')}
              disabled={!!problem}
              class="w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style="background: var(--color-accent); color: var(--color-on-accent)"
            >
              Checkout
            </button>
          {/if}
        {:else}
          <button
            type="submit"
            form="checkout-form"
            disabled={!ready || paying}
            class="w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style="background: var(--color-accent); color: var(--color-on-accent)"
          >
            {#if paying}
              Taking you to pay…
            {:else if missing}
              {missing}
            {:else}
              Pay {formatPrice(cart.getTotal(), cart.currency(), locale)}
            {/if}
          </button>
        {/if}
      </footer>
    {/if}
  </div>
{/if}
