<script lang="ts">
	import type { TourDate } from '$lib/server/schema';
	import { invalidateAll } from '$app/navigation';
	import { updateTourDate, deleteTourDate } from '../../../routes/admin/data.remote';

	interface Props {
		tourDate: TourDate | null;
		onclose: () => void;
	}

	let { tourDate, onclose }: Props = $props();

	// Form state
	let date = $state('');
	let venue = $state('');
	let city = $state('');
	let ticketUrl = $state('');
	let eventUrl = $state('');
	let soldOut = $state(false);
	let saving = $state(false);

	// Dialog ref
	let dialogEl: HTMLDialogElement;

	// Initialize form when tourDate changes
	$effect(() => {
		if (tourDate) {
			date = tourDate.date;
			venue = tourDate.venue;
			city = tourDate.city;
			ticketUrl = tourDate.ticketUrl || '';
			eventUrl = tourDate.eventUrl || '';
			soldOut = tourDate.soldOut || false;

			dialogEl?.showModal();
		}
	});

	function handleClose() {
		dialogEl?.close();
		onclose();
	}

	async function handleSave() {
		if (!tourDate) return;

		saving = true;
		try {
			await updateTourDate({
				id: tourDate.id,
				date,
				venue,
				city,
				ticketUrl: ticketUrl || null,
				eventUrl: eventUrl || null,
				soldOut
			});

			await invalidateAll();
			handleClose();
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!tourDate || !confirm('Delete this tour date?')) return;

		await deleteTourDate(tourDate.id);
		await invalidateAll();
		handleClose();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="fixed inset-0 m-auto h-fit w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
	onclose={handleClose}
>
	{#if tourDate}
		<div class="p-6">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Edit Tour Date</h2>
				<button onclick={handleClose} class="text-gray-400 hover:text-white" aria-label="Close dialog">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-4">
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
						<label for="tour-city" class="mb-1 block text-sm text-gray-400">City</label>
						<input
							id="tour-city"
							type="text"
							bind:value={city}
							placeholder="City"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label for="tour-venue" class="mb-1 block text-sm text-gray-400">Venue</label>
					<input
						id="tour-venue"
						type="text"
						bind:value={venue}
						placeholder="Venue name"
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
				<button onclick={handleDelete} class="text-sm text-red-400 hover:text-red-300">
					Delete date
				</button>
				<div class="flex gap-2">
					<button
						onclick={handleClose}
						class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
					>
						Cancel
					</button>
					<button
						onclick={handleSave}
						disabled={saving}
						class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</dialog>
