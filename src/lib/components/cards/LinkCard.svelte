<script lang="ts">
	import type { Link } from '$lib/server/schema';
	import { invalidateAll } from '$app/navigation';
	import { platformIcons, platformColors } from '$lib/utils/platforms';

	interface Props {
		link: Link;
		isAdmin: boolean;
	}

	let { link, isAdmin }: Props = $props();

	let isEditing = $state(false);
	let editUrl = $state('');
	let editLabel = $state('');

	// Sync edit values when link prop changes
	$effect(() => {
		if (!isEditing) {
			editUrl = link.url;
			editLabel = link.label ?? '';
		}
	});

	async function save() {
		if (editUrl === link.url && editLabel === link.label) {
			isEditing = false;
			return;
		}

		try {
			const res = await fetch(`/api/links/${link.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: editUrl, label: editLabel })
			});

			if (res.ok) {
				await invalidateAll();
			}
		} finally {
			isEditing = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			save();
		}
		if (e.key === 'Escape') {
			editUrl = link.url;
			editLabel = link.label ?? '';
			isEditing = false;
		}
	}

	const icon = $derived(platformIcons[link.platform] ?? null);
	const color = $derived(platformColors[link.platform] ?? 'var(--theme-primary)');
	const displayLabel = $derived(link.label || link.platform.replace('_', ' '));
</script>

{#if isEditing && isAdmin}
	<div class="rounded-xl border border-gray-600 p-4" style="background-color: var(--theme-secondary)">
		<div class="mb-3">
			<label for="edit-link-label-{link.id}" class="mb-1 block text-sm text-gray-400">Label</label>
			<input
				id="edit-link-label-{link.id}"
				type="text"
				bind:value={editLabel}
				onkeydown={handleKeydown}
				class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
				placeholder="Display label"
			/>
		</div>
		<div class="mb-3">
			<label for="edit-link-url-{link.id}" class="mb-1 block text-sm text-gray-400">URL</label>
			<input
				id="edit-link-url-{link.id}"
				type="url"
				bind:value={editUrl}
				onkeydown={handleKeydown}
				class="w-full rounded border border-gray-600 bg-transparent p-2 text-white focus:border-[var(--theme-primary)] focus:outline-none"
				placeholder="https://..."
			/>
		</div>
		<div class="flex gap-2">
			<button
				onclick={save}
				class="rounded px-4 py-2 text-sm text-white"
				style="background-color: var(--theme-primary)"
			>
				Save
			</button>
			<button
				onclick={() => {
					editUrl = link.url;
					editLabel = link.label ?? '';
					isEditing = false;
				}}
				class="rounded bg-gray-600 px-4 py-2 text-sm text-white"
			>
				Cancel
			</button>
		</div>
	</div>
{:else if link.thumbnailUrl}
	<!-- Link with thumbnail (YouTube, etc.) -->
	<a
		href={isAdmin ? undefined : link.url}
		onclick={isAdmin ? () => (isEditing = true) : undefined}
		class="group flex items-center gap-4 rounded-xl p-4 transition-all hover:scale-[1.02]"
		style="background-color: var(--theme-secondary)"
		target={isAdmin ? undefined : '_blank'}
		rel={isAdmin ? undefined : 'noopener noreferrer'}
	>
		<img
			src={link.thumbnailUrl}
			alt={displayLabel}
			loading="lazy"
			class="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
		/>
		<div class="min-w-0 flex-1">
			<p class="truncate font-medium text-white">{displayLabel}</p>
			<div class="flex items-center gap-2 text-sm text-gray-400">
				{#if icon}
					<svg viewBox="0 0 24 24" class="h-4 w-4" style="fill: {color}">
						<path d={icon} />
					</svg>
				{/if}
				<span class="capitalize">{link.platform.replace('_', ' ')}</span>
			</div>
		</div>
		{#if isAdmin}
			<span class="text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
				Edit
			</span>
		{:else}
			<svg class="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
			</svg>
		{/if}
	</a>
{:else}
	<!-- Standard link without thumbnail -->
	<a
		href={isAdmin ? undefined : link.url}
		onclick={isAdmin ? () => (isEditing = true) : undefined}
		class="group flex items-center gap-4 rounded-xl p-4 transition-all hover:scale-[1.02]"
		style="background-color: var(--theme-secondary)"
		target={isAdmin ? undefined : '_blank'}
		rel={isAdmin ? undefined : 'noopener noreferrer'}
	>
		{#if icon}
			<svg
				viewBox="0 0 24 24"
				class="h-6 w-6 flex-shrink-0"
				style="fill: {color}"
			>
				<path d={icon} />
			</svg>
		{:else}
			<div
				class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-bold text-white"
				style="background-color: {color}"
			>
				{link.platform.charAt(0).toUpperCase()}
			</div>
		{/if}
		<span class="flex-1 font-medium capitalize text-white">{displayLabel}</span>
		{#if isAdmin}
			<span class="text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
				Edit
			</span>
		{:else}
			<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
			</svg>
		{/if}
	</a>
{/if}
