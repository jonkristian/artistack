<script lang="ts">
  import { untrack } from 'svelte';
  import { fieldClass, labelClass } from '$lib/utils/classes';
  import { ToggleSwitch } from '$lib/components/ui';
  import type { TourDate, Venue } from '$lib/server/schema';
  import VenueAutocomplete from '../inputs/VenueAutocomplete.svelte';

  export interface TourDateValues {
    date: string;
    time: string | null;
    title: string | null;
    venue: Venue;
    lineup: string | null;
    ticketUrl: string | null;
    eventUrl: string | null;
    soldOut: boolean;
  }

  interface Props {
    /** The date being edited, or 'new'. The parent mounts this only when open. */
    tourDate: TourDate | 'new';
    googleApiKey?: string | null;
    onsave: (values: TourDateValues) => void;
    ondelete: (id: number) => void;
    onclose: () => void;
  }

  let { tourDate, googleApiKey, onsave, ondelete, onclose }: Props = $props();

  /*
   * Read once, in the script body rather than an $effect. An effect reading
   * these would be invalidated by handleSave() writing them, and would reopen
   * the dialog a microtask after close(); the parent remounts this component
   * per open, so there is no later value to react to.
   */
  const initial = untrack(() => (tourDate === 'new' ? null : tourDate));
  const isNew = !initial;

  let date = $state(initial?.date ?? '');
  let time = $state(initial?.time ?? '');
  let title = $state(initial?.title ?? '');
  let venue = $state<Venue>(initial ? { ...initial.venue } : { name: '', city: '' });
  let lineup = $state(initial?.lineup ?? '');
  let ticketUrl = $state(initial?.ticketUrl ?? '');
  let eventUrl = $state(initial?.eventUrl ?? '');
  let soldOut = $state(initial?.soldOut ?? false);

  let dialogEl: HTMLDialogElement;

  // Reads only the element ref, so it runs once on mount and never re-opens.
  $effect(() => {
    dialogEl?.showModal();
  });

  function closeDialog() {
    dialogEl?.close();
  }

  function handleDialogClose() {
    onclose();
  }

  function handleVenueChange(newVenue: Venue) {
    venue = newVenue;
  }

  function handleSave() {
    if (!date || !venue.name) return;

    onsave({
      date,
      time: time || null,
      title: title || null,
      venue,
      lineup: lineup || null,
      ticketUrl: ticketUrl || null,
      eventUrl: eventUrl || null,
      soldOut
    });
    closeDialog();
  }

  function handleDelete() {
    if (!initial) return;
    if (!confirm('Delete this tour date?')) return;
    ondelete(initial.id);
    closeDialog();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
  onclose={handleDialogClose}
>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold">{isNew ? 'Add Tour Date' : 'Edit Tour Date'}</h2>
      <button
        onclick={closeDialog}
        class="text-gray-400 hover:text-white"
        aria-label="Close dialog"
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
    </div>

    <div class="space-y-4">
      <div>
        <label for="tour-title" class={labelClass}>Title</label>
        <input
          id="tour-title"
          type="text"
          bind:value={title}
          placeholder="Event or show title (optional)"
          class={fieldClass}
        />
      </div>

      <div>
        <label for="tour-city" class={labelClass}>City</label>
        <input
          id="tour-city"
          type="text"
          bind:value={venue.city}
          placeholder="City name"
          class={fieldClass}
        />
        {#if googleApiKey}
          <p class="mt-1 text-xs text-gray-500">Enter city first to narrow venue search</p>
        {/if}
      </div>

      <div>
        <label for="tour-venue" class={labelClass}>Venue</label>
        <VenueAutocomplete
          apiKey={googleApiKey}
          {venue}
          cityBias={venue.city}
          onchange={handleVenueChange}
        />
        {#if venue.address}
          <p class="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <span>{venue.address}</span>
            <a
              href={venue.placeId
                ? `https://www.google.com/maps/place/?q=place_id:${venue.placeId}`
                : venue.lat && venue.lng
                  ? `https://www.google.com/maps?q=${venue.lat},${venue.lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              class="cursor-pointer text-gray-400 hover:text-white"
              title="Open in Google Maps"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </a>
          </p>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="tour-date" class={labelClass}>Date</label>
          <input id="tour-date" type="date" bind:value={date} class={fieldClass} />
        </div>
        <div>
          <label for="tour-time" class={labelClass}>Time</label>
          <input id="tour-time" type="time" bind:value={time} class={fieldClass} />
        </div>
      </div>

      <div>
        <label for="tour-lineup" class={labelClass}>Line-up</label>
        <input
          id="tour-lineup"
          type="text"
          bind:value={lineup}
          placeholder="e.g., with Special Guest, DJ Support"
          class={fieldClass}
        />
      </div>

      <div>
        <label for="tour-ticket-url" class={labelClass}>Ticket URL</label>
        <input
          id="tour-ticket-url"
          type="url"
          bind:value={ticketUrl}
          placeholder="https://..."
          class={fieldClass}
        />
      </div>

      <div>
        <label for="tour-event-url" class={labelClass}>Event URL</label>
        <input
          id="tour-event-url"
          type="url"
          bind:value={eventUrl}
          placeholder="https://facebook.com/events/..."
          class={fieldClass}
        />
        <p class="mt-1 text-xs text-gray-500">Facebook, Bandsintown, etc.</p>
      </div>

      <label class="flex cursor-pointer items-center justify-between">
        <span class="text-sm text-gray-400">Sold out</span>
        <ToggleSwitch
          bind:checked={soldOut}
          label="Mark as sold out"
          size="md"
          accent="red"
          hideLabel
        />
      </label>
    </div>

    <!-- Actions -->
    <div class="mt-6 flex items-center justify-between border-t border-gray-700 pt-4">
      {#if !isNew}
        <button onclick={handleDelete} class="text-sm text-red-400 hover:text-red-300">
          Delete date
        </button>
      {:else}
        <div></div>
      {/if}
      <div class="flex gap-2">
        <button
          onclick={closeDialog}
          class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onclick={handleSave}
          disabled={!date || !venue.name}
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {isNew ? 'Add' : 'Apply'}
        </button>
      </div>
    </div>
  </div>
</dialog>
