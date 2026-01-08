<script lang="ts">
	import type { TourDate } from '$lib/server/schema';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		tourDate: TourDate;
		isAdmin: boolean;
	}

	let { tourDate, isAdmin }: Props = $props();

	let isEditing = $state(false);
	let editDate = $state('');
	let editVenue = $state('');
	let editCity = $state('');
	let editTicketUrl = $state('');
	let editSoldOut = $state(false);

	// Sync edit values when tourDate prop changes
	$effect(() => {
		if (!isEditing) {
			editDate = tourDate.date;
			editVenue = tourDate.venue;
			editCity = tourDate.city;
			editTicketUrl = tourDate.ticketUrl ?? '';
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
					venue: editVenue,
					city: editCity,
					ticketUrl: editTicketUrl || null,
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
		editVenue = tourDate.venue;
		editCity = tourDate.city;
		editTicketUrl = tourDate.ticketUrl ?? '';
		editSoldOut = tourDate.soldOut ?? false;
		isEditing = false;
	}
</script>

{#if isEditing && isAdmin}
	<div class="rounded-xl border border-gray-600 p-4" style="background-color: var(--theme-secondary)">
		<div class="mb-3 grid grid-cols-2 gap-3">
			<div>
				<label for="edit-tour-date-{tourDate.id}" class="mb-1 block text-sm text-gray-400">Date</label>
				<input
					id="edit-tour-date-{tourDate.id}"
					type="date"
					bind:value={editDate}
					class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
				/>
			</div>
			<div>
				<label for="edit-tour-city-{tourDate.id}" class="mb-1 block text-sm text-gray-400">City</label>
				<input
					id="edit-tour-city-{tourDate.id}"
					type="text"
					bind:value={editCity}
					class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
				/>
			</div>
		</div>
		<div class="mb-3">
			<label for="edit-tour-venue-{tourDate.id}" class="mb-1 block text-sm text-gray-400">Venue</label>
			<input
				id="edit-tour-venue-{tourDate.id}"
				type="text"
				bind:value={editVenue}
				class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
			/>
		</div>
		<div class="mb-3">
			<label for="edit-tour-ticket-{tourDate.id}" class="mb-1 block text-sm text-gray-400">Ticket URL</label>
			<input
				id="edit-tour-ticket-{tourDate.id}"
				type="url"
				bind:value={editTicketUrl}
				class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
				placeholder="https://..."
			/>
		</div>
		<div class="mb-3">
			<label for="edit-tour-soldout-{tourDate.id}" class="flex items-center gap-2 text-sm text-gray-400">
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
		class="group flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all {isAdmin ? 'cursor-pointer hover:scale-[1.02]' : ''}"
		style="background-color: var(--theme-secondary)"
		disabled={!isAdmin && !tourDate.ticketUrl}
	>
		<div class="flex-shrink-0 text-center">
			<div class="text-2xl font-bold" style="color: var(--theme-primary)">{formattedDate()}</div>
		</div>
		<div class="flex-1">
			<div class="font-medium text-white">{tourDate.venue}</div>
			<div class="text-sm text-gray-400">{tourDate.city}</div>
		</div>
		{#if tourDate.soldOut}
			<span class="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white">Sold Out</span>
		{:else if tourDate.ticketUrl && !isAdmin}
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
		{:else if isAdmin}
			<span class="text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
				Edit
			</span>
		{/if}
	</button>
{/if}
