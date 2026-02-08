<script lang="ts">
  import type { TourDate } from '$lib/server/schema';
  import { invalidateAll } from '$app/navigation';
  import { getPlatformInfoFromUrl } from '$lib/utils/platforms';

  interface Props {
    tourDate: TourDate;
    isAdmin: boolean;
  }

  let { tourDate, isAdmin }: Props = $props();

  // Derive event platform info from URL
  const eventPlatform = $derived(
    tourDate.eventUrl ? getPlatformInfoFromUrl(tourDate.eventUrl) : null
  );

  let isEditing = $state(false);
  let editDate = $state('');
  let editTime = $state('');
  let editTitle = $state('');
  let editVenueName = $state('');
  let editVenueCity = $state('');
  let editLineup = $state('');
  let editTicketUrl = $state('');
  let editEventUrl = $state('');
  let editSoldOut = $state(false);

  // Sync edit values when tourDate prop changes
  $effect(() => {
    if (!isEditing) {
      editDate = tourDate.date;
      editTime = tourDate.time ?? '';
      editTitle = tourDate.title ?? '';
      editVenueName = tourDate.venue.name;
      editVenueCity = tourDate.venue.city;
      editLineup = tourDate.lineup ?? '';
      editTicketUrl = tourDate.ticketUrl ?? '';
      editEventUrl = tourDate.eventUrl ?? '';
      editSoldOut = tourDate.soldOut ?? false;
    }
  });

  const formattedDate = $derived(() => {
    try {
      return new Date(tourDate.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return tourDate.date;
    }
  });

  async function save() {
    try {
      const res = await fetch(`/api/tour/${tourDate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          time: editTime || null,
          title: editTitle || null,
          venue: {
            name: editVenueName,
            city: editVenueCity,
            // Preserve existing venue data
            address: tourDate.venue.address,
            placeId: tourDate.venue.placeId,
            lat: tourDate.venue.lat,
            lng: tourDate.venue.lng
          },
          lineup: editLineup || null,
          ticketUrl: editTicketUrl || null,
          eventUrl: editEventUrl || null,
          soldOut: editSoldOut
        })
      });

      if (res.ok) {
        await invalidateAll();
      }
    } finally {
      isEditing = false;
    }
  }

  function cancel() {
    editDate = tourDate.date;
    editTime = tourDate.time ?? '';
    editTitle = tourDate.title ?? '';
    editVenueName = tourDate.venue.name;
    editVenueCity = tourDate.venue.city;
    editLineup = tourDate.lineup ?? '';
    editTicketUrl = tourDate.ticketUrl ?? '';
    editEventUrl = tourDate.eventUrl ?? '';
    editSoldOut = tourDate.soldOut ?? false;
    isEditing = false;
  }
</script>

{#if isEditing && isAdmin}
  <div
    class="rounded-xl border border-gray-600 p-4"
    style="background-color: var(--theme-secondary)"
  >
    <div class="mb-3 grid grid-cols-2 gap-3">
      <div>
        <label for="edit-tour-date-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
          >Date</label
        >
        <input
          id="edit-tour-date-{tourDate.id}"
          type="date"
          bind:value={editDate}
          class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
        />
      </div>
      <div>
        <label for="edit-tour-time-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
          >Time</label
        >
        <input
          id="edit-tour-time-{tourDate.id}"
          type="time"
          bind:value={editTime}
          class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
        />
      </div>
    </div>
    <div class="mb-3">
      <label for="edit-tour-title-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
        >Title</label
      >
      <input
        id="edit-tour-title-{tourDate.id}"
        type="text"
        bind:value={editTitle}
        placeholder="Event or show title (optional)"
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
      />
    </div>
    <div class="mb-3">
      <label for="edit-tour-venue-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
        >Venue</label
      >
      <input
        id="edit-tour-venue-{tourDate.id}"
        type="text"
        bind:value={editVenueName}
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
      />
    </div>
    <div class="mb-3">
      <label for="edit-tour-city-{tourDate.id}" class="mb-1 block text-sm text-gray-400">City</label
      >
      <input
        id="edit-tour-city-{tourDate.id}"
        type="text"
        bind:value={editVenueCity}
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
      />
    </div>
    <div class="mb-3">
      <label for="edit-tour-lineup-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
        >Line-up</label
      >
      <input
        id="edit-tour-lineup-{tourDate.id}"
        type="text"
        bind:value={editLineup}
        placeholder="e.g., with Special Guest, DJ Support"
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
      />
    </div>
    <div class="mb-3">
      <label for="edit-tour-ticket-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
        >Ticket URL</label
      >
      <input
        id="edit-tour-ticket-{tourDate.id}"
        type="url"
        bind:value={editTicketUrl}
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
        placeholder="https://..."
      />
    </div>
    <div class="mb-3">
      <label for="edit-tour-event-{tourDate.id}" class="mb-1 block text-sm text-gray-400"
        >Event URL</label
      >
      <input
        id="edit-tour-event-{tourDate.id}"
        type="url"
        bind:value={editEventUrl}
        class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
        placeholder="https://facebook.com/events/..."
      />
    </div>
    <div class="mb-3">
      <label
        for="edit-tour-soldout-{tourDate.id}"
        class="flex items-center gap-2 text-sm text-gray-400"
      >
        <input
          id="edit-tour-soldout-{tourDate.id}"
          type="checkbox"
          bind:checked={editSoldOut}
          class="rounded"
        />
        Sold Out
      </label>
    </div>
    <div class="flex gap-2">
      <button
        onclick={save}
        class="rounded px-4 py-2 text-sm text-white"
        style="background-color: var(--theme-primary)"
      >
        Save
      </button>
      <button onclick={cancel} class="rounded bg-gray-600 px-4 py-2 text-sm text-white">
        Cancel
      </button>
    </div>
  </div>
{:else}
  <button
    onclick={isAdmin ? () => (isEditing = true) : undefined}
    class="group flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all {isAdmin
      ? 'cursor-pointer hover:scale-[1.02]'
      : ''}"
    style="background-color: var(--theme-secondary)"
    disabled={!isAdmin && !tourDate.ticketUrl && !tourDate.eventUrl}
  >
    <div class="flex-shrink-0 text-center">
      <div class="text-2xl font-bold" style="color: var(--theme-primary)">{formattedDate()}</div>
    </div>
    <div class="flex-1">
      <div class="font-medium text-white">{tourDate.venue.name}</div>
      <div class="text-sm text-gray-400">{tourDate.venue.city}</div>
    </div>
    {#if tourDate.soldOut}
      <span class="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white">Sold Out</span>
    {:else if !isAdmin && (tourDate.ticketUrl || tourDate.eventUrl)}
      <div class="flex gap-2">
        {#if tourDate.eventUrl}
          <a
            href={tourDate.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 rounded border border-gray-600 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            onclick={(e) => e.stopPropagation()}
          >
            {#if eventPlatform?.icon}
              <svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: {eventPlatform.color}">
                <path d={eventPlatform.icon} />
              </svg>
            {/if}
            <span
              >{eventPlatform?.platform
                ? eventPlatform.platform.charAt(0).toUpperCase() + eventPlatform.platform.slice(1)
                : 'Event'}</span
            >
          </a>
        {/if}
        {#if tourDate.ticketUrl}
          <a
            href={tourDate.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            style="background-color: var(--theme-primary)"
            onclick={(e) => e.stopPropagation()}
          >
            Tickets
          </a>
        {/if}
      </div>
    {:else if isAdmin}
      <span class="text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
        Edit
      </span>
    {/if}
  </button>
{/if}
