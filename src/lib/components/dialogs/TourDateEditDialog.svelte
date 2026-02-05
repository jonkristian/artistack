<script lang="ts">
	import type { TourDate, Venue } from '$lib/server/schema';
	import { toast } from '$lib/stores/toast.svelte';
	import { getTempId } from '$lib/stores/pageDraft.svelte';
	import VenueAutocomplete from '../inputs/VenueAutocomplete.svelte';

	interface Props {
		tourDate: TourDate | 'new' | null;
		tourDates: TourDate[];
		blockId?: number | null;
		googleApiKey?: string | null;
		onclose: () => void;
	}

	let { tourDate, tourDates, blockId, googleApiKey, onclose }: Props = $props();

	// Derived state
	const isNew = $derived(tourDate === 'new');
	const isOpen = $derived(tourDate !== null);

	// Form state
	let date = $state('');
	let time = $state('');
	let title = $state('');
	let venue = $state<Venue>({ name: '', city: '' });
	let lineup = $state('');
	let ticketUrl = $state('');
	let eventUrl = $state('');
	let soldOut = $state(false);

	// Dialog ref
	let dialogEl: HTMLDialogElement;

	// Initialize form when tourDate changes
	$effect(() => {
		if (tourDate === 'new') {
			date = '';
			time = '';
			title = '';
			venue = { name: '', city: '' };
			lineup = '';
			ticketUrl = '';
			eventUrl = '';
			soldOut = false;
			dialogEl?.showModal();
		} else if (tourDate) {
			date = tourDate.date;
			time = tourDate.time || '';
			title = tourDate.title || '';
			venue = { ...tourDate.venue };
			lineup = tourDate.lineup || '';
			ticketUrl = tourDate.ticketUrl || '';
			eventUrl = tourDate.eventUrl || '';
			soldOut = tourDate.soldOut || false;
			dialogEl?.showModal();
		}
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

		if (isNew) {
			// Add new tour date
			const blockTourDates = tourDates.filter(t => t.blockId === blockId);
			const newTourDate: TourDate = {
				id: getTempId(),
				blockId: blockId ?? 0,
				date,
				time: time || null,
				title: title || null,
				venue,
				lineup: lineup || null,
				ticketUrl: ticketUrl || null,
				eventUrl: eventUrl || null,
				soldOut,
				position: blockTourDates.length
			};
			tourDates.push(newTourDate);
			tourDates.length = tourDates.length; // trigger reactivity
			toast.info('Tour date added');
		} else if (tourDate && tourDate !== 'new') {
			// Update existing tour date directly
			tourDate.date = date;
			tourDate.time = time || null;
			tourDate.title = title || null;
			tourDate.venue = venue;
			tourDate.lineup = lineup || null;
			tourDate.ticketUrl = ticketUrl || null;
			tourDate.eventUrl = eventUrl || null;
			tourDate.soldOut = soldOut;
			tourDates.length = tourDates.length; // trigger reactivity
			toast.info('Tour date updated');
		}

		closeDialog();
	}

	function handleDelete() {
		if (isNew || !tourDate || tourDate === 'new') return;
		if (!confirm('Delete this tour date?')) return;

		const index = tourDates.findIndex(t => t.id === tourDate.id);
		if (index !== -1) {
			tourDates.splice(index, 1);
			tourDates.length = tourDates.length;
		}
		toast.info('Tour date deleted');
		closeDialog();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
	onclose={handleDialogClose}
>
	{#if isOpen}
		<div class="p-6">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-lg font-semibold">{isNew ? 'Add Tour Date' : 'Edit Tour Date'}</h2>
				<button onclick={closeDialog} class="text-gray-400 hover:text-white" aria-label="Close dialog">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-4">
				<div>
					<label for="tour-title" class="mb-1 block text-sm text-gray-400">Title</label>
					<input
						id="tour-title"
						type="text"
						bind:value={title}
						placeholder="Event or show title (optional)"
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
				</div>

				<div>
					<label for="tour-city" class="mb-1 block text-sm text-gray-400">City</label>
					<input
						id="tour-city"
						type="text"
						bind:value={venue.city}
						placeholder="City name"
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
					{#if googleApiKey}
						<p class="mt-1 text-xs text-gray-500">Enter city first to narrow venue search</p>
					{/if}
				</div>

				<div>
					<label for="tour-venue" class="mb-1 block text-sm text-gray-400">Venue</label>
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
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
							</a>
						</p>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="tour-date" class="mb-1 block text-sm text-gray-400">Date</label>
						<input
							id="tour-date"
							type="date"
							bind:value={date}
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-600 focus:outline-none"
						/>
					</div>
					<div>
						<label for="tour-time" class="mb-1 block text-sm text-gray-400">Time</label>
						<input
							id="tour-time"
							type="time"
							bind:value={time}
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-600 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label for="tour-lineup" class="mb-1 block text-sm text-gray-400">Line-up</label>
					<input
						id="tour-lineup"
						type="text"
						bind:value={lineup}
						placeholder="e.g., with Special Guest, DJ Support"
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
				</div>

				<div>
					<label for="tour-ticket-url" class="mb-1 block text-sm text-gray-400">Ticket URL</label>
					<input
						id="tour-ticket-url"
						type="url"
						bind:value={ticketUrl}
						placeholder="https://..."
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
				</div>

				<div>
					<label for="tour-event-url" class="mb-1 block text-sm text-gray-400">Event URL</label>
					<input
						id="tour-event-url"
						type="url"
						bind:value={eventUrl}
						placeholder="https://facebook.com/events/..."
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
					<p class="mt-1 text-xs text-gray-500">Facebook, Bandsintown, etc.</p>
				</div>

				<label class="flex cursor-pointer items-center justify-between">
					<span class="text-sm text-gray-400">Sold out</span>
					<button
						type="button"
						role="switch"
						aria-checked={soldOut}
						aria-label="Mark as sold out"
						onclick={() => (soldOut = !soldOut)}
						class="relative h-6 w-11 rounded-full transition-colors {soldOut ? 'bg-red-600' : 'bg-gray-700'}"
					>
						<span
							class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {soldOut ? 'translate-x-5' : ''}"
						></span>
					</button>
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
	{/if}
</dialog>
