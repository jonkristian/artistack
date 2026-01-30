<script lang="ts">
	import { MediaPicker, SortableList, ListItem, LayoutPreview } from '$lib/components/ui';
	import { SectionCard } from '$lib/components/cards';
	import { LinkEditDialog, TourDateEditDialog } from '$lib/components/dialogs';
	import Default from '$lib/themes/Default.svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import type { Link, TourDate } from '$lib/server/schema';
	import {
		saveProfile,
		updateProfileImage,
		addLink,
		deleteLink,
		reorderLinks,
		deleteTourDate
	} from './data.remote';

	let { data }: { data: PageData } = $props();

	// Link edit dialog state
	let editingLink = $state<Link | null>(null);

	function openLinkDialog(link: Link) {
		editingLink = link;
	}

	function closeLinkDialog() {
		editingLink = null;
	}

	// Tour date edit dialog state
	let editingTourDate = $state<TourDate | 'new' | null>(null);

	function openTourDateDialog(tourDate: TourDate | 'new') {
		editingTourDate = tourDate;
	}

	function closeTourDateDialog() {
		editingTourDate = null;
	}

	// Theme colors for embed options
	const themeColors = $derived({
		bg: data.profile?.colorBg ?? '#0f0f0f',
		card: data.profile?.colorCard ?? '#1a1a1a',
		accent: data.profile?.colorAccent ?? '#8b5cf6'
	});

	// Profile state (for live preview and auto-save)
	let profileName = $state(data.profile?.name ?? '');
	let profileBio = $state(data.profile?.bio ?? '');
	let profileEmail = $state(data.profile?.email ?? '');

	// Track original values to detect changes
	let originalName = data.profile?.name ?? '';
	let originalBio = data.profile?.bio ?? '';
	let originalEmail = data.profile?.email ?? '';

	// Auto-save profile field on blur
	async function saveProfileField(field: 'name' | 'bio' | 'email') {
		const currentValue = field === 'name' ? profileName : field === 'bio' ? profileBio : profileEmail;
		const originalValue = field === 'name' ? originalName : field === 'bio' ? originalBio : originalEmail;

		// Only save if value changed
		if (currentValue === originalValue) return;

		try {
			await saveProfile({
				name: profileName || 'Artist Name',
				bio: profileBio || undefined,
				email: profileEmail || undefined
			});

			// Update original values
			originalName = profileName;
			originalBio = profileBio;
			originalEmail = profileEmail;

			toast.success('Profile saved');
			await invalidateAll();
		} catch (e) {
			toast.error('Failed to save profile');
		}
	}

	// Live preview profile
	const liveProfile = $derived({
		...data.profile,
		name: profileName || 'Artist Name',
		bio: profileBio || '',
		email: profileEmail || ''
	});

	// Link forms with unique instances
	const socialLinkForm = addLink.for('social');
	const streamingLinkForm = addLink.for('streaming');

	// Sortable link lists (mutable state for DnD)
	let socialLinks = $state<Link[]>([]);
	let streamingLinks = $state<Link[]>([]);

	// Sync lists when data changes
	$effect(() => {
		socialLinks = data.links.filter((l) => l.category === 'social');
		streamingLinks = data.links.filter((l) => l.category === 'streaming');
	});

	// Derived values for preview - combines all link categories with current order
	const otherLinks = $derived(data.links.filter((l) => l.category !== 'social' && l.category !== 'streaming'));
	const liveLinks = $derived([...socialLinks, ...streamingLinks, ...otherLinks]);

	async function handleDeleteLink(id: number) {
		try {
			await deleteLink(id);
			await invalidateAll();
			toast.success('Link deleted');
		} catch (e) {
			toast.error('Failed to delete link');
		}
	}

	async function handleReorderLinks(items: Link[]) {
		try {
			await reorderLinks(items.map((item, i) => ({ id: item.id, position: i })));
		} catch (e) {
			toast.error('Failed to reorder links');
		}
	}

	async function handleDeleteTourDate(id: number) {
		try {
			await deleteTourDate(id);
			await invalidateAll();
			toast.success('Tour date deleted');
		} catch (e) {
			toast.error('Failed to delete tour date');
		}
	}
</script>

<div class="flex h-screen">
	<!-- Left Column: Edit Controls -->
	<div class="w-1/2 overflow-y-auto bg-gray-950 p-6">
		<div class="space-y-6">
			<!-- Profile Card -->
			<SectionCard title="Profile">
				<div class="space-y-3">
					<div>
						<label for="profile-name" class="mb-1 block text-sm text-gray-400">Artist Name</label>
						<input
							id="profile-name"
							type="text"
							bind:value={profileName}
							onblur={() => saveProfileField('name')}
							placeholder="Your artist or band name"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
						/>
					</div>
					<div>
						<label for="profile-bio" class="mb-1 block text-sm text-gray-400">Bio</label>
						<textarea
							id="profile-bio"
							bind:value={profileBio}
							onblur={() => saveProfileField('bio')}
							placeholder="A short bio or tagline"
							rows={3}
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
						></textarea>
					</div>
					<div>
						<label for="profile-email" class="mb-1 block text-sm text-gray-400">Email</label>
						<input
							id="profile-email"
							type="email"
							bind:value={profileEmail}
							onblur={() => saveProfileField('email')}
							placeholder="contact@example.com"
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
						/>
					</div>
				</div>

				<!-- Social Links -->
				<div class="mt-5 border-t border-gray-800 pt-5">
					<span class="mb-2 block text-xs font-medium text-gray-500">Social Media</span>
					<form
						{...socialLinkForm.enhance(async ({ submit }) => {
							try {
								await submit();
								socialLinkForm.fields.set({ url: '' });
								await invalidateAll();
								toast.success('Link added');
							} catch (e) {
								toast.error('Failed to add link');
							}
						})}
						class="mb-3 flex gap-2"
					>
						<input type="hidden" name="category" value="social" />
						<input
							{...socialLinkForm.fields.url.as('text')}
							placeholder="Instagram, TikTok, Twitter URL..."
							aria-label="Social media URL"
							class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={!!socialLinkForm.pending}
							class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
						>
							{socialLinkForm.pending ? '...' : 'Add'}
						</button>
					</form>
					{#each socialLinkForm.fields.url.issues() as issue}
						<p class="mb-2 text-xs text-red-400">{issue.message}</p>
					{/each}
					{#if socialLinks.length > 0}
						<SortableList bind:items={socialLinks} onreorder={handleReorderLinks}>
							{#snippet children(link)}
								<div class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800">
									<div class="flex cursor-grab items-center gap-2 active:cursor-grabbing">
										<svg class="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
										</svg>
										<span class="text-sm capitalize text-white">{link.platform}</span>
									</div>
									<div class="flex items-center gap-1">
										<button
											onclick={() => openLinkDialog(link)}
											class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-white group-hover:opacity-100"
											aria-label="Edit {link.platform} link"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
											</svg>
										</button>
										<button
											onclick={() => handleDeleteLink(link.id)}
											class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-red-400 group-hover:opacity-100"
											aria-label="Delete {link.platform} link"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								</div>
							{/snippet}
						</SortableList>
					{/if}
				</div>
			</SectionCard>

			<!-- Images Card -->
			<SectionCard title="Images">
				<div class="grid grid-cols-2 gap-3">
					<MediaPicker
						value={data.profile?.logoUrl ?? null}
						label="Logo"
						media={data.media}
						aspectRatio="1/1"
						shapes={['circle', 'rounded', 'square']}
						defaultShape={(data.profile?.logoShape as 'circle' | 'rounded' | 'square') ?? 'circle'}
						onselect={async (url, shape) => {
							try {
								await updateProfileImage({ type: 'logo', url, shape });
								await invalidateAll();
								toast.success('Logo updated');
							} catch (e) {
								toast.error('Failed to update logo');
							}
						}}
					/>
					<MediaPicker
						value={data.profile?.photoUrl ?? null}
						label="Band Photo"
						media={data.media}
						aspectRatio="1/1"
						shapes={['circle', 'rounded', 'square', 'wide', 'wide-rounded']}
						defaultShape={(data.profile?.photoShape as 'circle' | 'rounded' | 'square' | 'wide' | 'wide-rounded') ?? 'wide-rounded'}
						onselect={async (url, shape) => {
							try {
								await updateProfileImage({ type: 'photo', url, shape });
								await invalidateAll();
								toast.success('Photo updated');
							} catch (e) {
								toast.error('Failed to update photo');
							}
						}}
					/>
				</div>
			</SectionCard>

			<!-- Streaming Card -->
			<SectionCard title="Streaming">
				<form
					{...streamingLinkForm.enhance(async ({ submit }) => {
						try {
							await submit();
							streamingLinkForm.fields.set({ url: '' });
							await invalidateAll();
							toast.success('Link added');
						} catch (e) {
							toast.error('Failed to add link');
						}
					})}
					class="mb-3 flex gap-2"
				>
					<input type="hidden" name="category" value="streaming" />
					<input
						{...streamingLinkForm.fields.url.as('text')}
						placeholder="Spotify, Apple Music, YouTube, Bandcamp URL..."
						aria-label="Streaming platform URL"
						class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-600 focus:outline-none"
					/>
					<button
						type="submit"
						disabled={!!streamingLinkForm.pending}
						class="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
					>
						{streamingLinkForm.pending ? '...' : 'Add'}
					</button>
				</form>
				{#each streamingLinkForm.fields.url.issues() as issue}
					<p class="mb-2 text-xs text-red-400">{issue.message}</p>
				{/each}
				<p class="mb-3 text-xs text-gray-500">Thumbnails auto-fetched for Spotify, YouTube & Bandcamp</p>
				{#if streamingLinks.length > 0}
					<SortableList bind:items={streamingLinks} onreorder={handleReorderLinks}>
						{#snippet children(link)}
							<div class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800">
								<div class="flex cursor-grab items-center gap-2 min-w-0 active:cursor-grabbing">
									<svg class="h-4 w-4 shrink-0 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
									</svg>
									{#if link.thumbnailUrl}
										<img src={link.thumbnailUrl} alt="" loading="lazy" class="h-8 w-8 rounded object-cover" />
									{/if}
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="text-sm text-white truncate">{link.label || link.platform.replace('_', ' ')}</span>
											{#if link.embedData && link.embedData.enabled !== false}
												<span class="text-xs text-violet-400">Player</span>
											{/if}
										</div>
										<span class="text-xs text-gray-500 capitalize">{link.platform.replace('_', ' ')}</span>
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-1">
									<button
										onclick={() => openLinkDialog(link)}
										class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-white group-hover:opacity-100"
										aria-label="Edit {link.label || link.platform} link"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									</button>
									<button
										onclick={() => handleDeleteLink(link.id)}
										class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-red-400 group-hover:opacity-100"
										aria-label="Delete {link.label || link.platform} link"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						{/snippet}
					</SortableList>
				{/if}
			</SectionCard>

			<!-- Tour Dates Card -->
			<SectionCard title="Tour Dates">
				<div class="mb-3 flex justify-end">
					<button
						onclick={() => openTourDateDialog('new')}
						class="text-sm text-gray-400 hover:text-white"
					>
						+ Add
					</button>
				</div>

				<div class="space-y-2">
					{#each data.tourDates as t (t.id)}
						<div class="group flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2 transition-colors hover:bg-gray-800">
							<div class="text-sm">
								<span class="text-gray-400">{t.date}</span>
								<span class="mx-2 text-gray-600">-</span>
								<span class="text-white">{t.venue.name}</span>
								<span class="text-gray-500">, {t.venue.city}</span>
								{#if t.soldOut}
									<span class="ml-2 text-xs text-red-400">Sold out</span>
								{/if}
							</div>
							<div class="flex items-center gap-1">
								<button
									onclick={() => openTourDateDialog(t)}
									class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-white group-hover:opacity-100"
									aria-label="Edit tour date"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</button>
								<button
									onclick={() => handleDeleteTourDate(t.id)}
									class="cursor-pointer rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-700 hover:text-red-400 group-hover:opacity-100"
									aria-label="Delete tour date"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
					{:else}
						<p class="py-4 text-center text-sm text-gray-600">No tour dates yet</p>
					{/each}
				</div>
			</SectionCard>

			<!-- Other Links Card -->
			{#if otherLinks.length > 0}
				<SectionCard title="Other Links">
					<div class="space-y-2">
						{#each otherLinks as link (link.id)}
							<ListItem ondelete={() => handleDeleteLink(link.id)}>
								<span class="text-sm text-white">{link.label || link.platform}</span>
							</ListItem>
						{/each}
					</div>
				</SectionCard>
			{/if}
		</div>
	</div>

	<!-- Right Column: Live Preview -->
	<div class="w-1/2 overflow-y-auto border-l border-gray-800">
		<LayoutPreview
			layout={Default}
			profile={liveProfile}
			links={liveLinks}
			tourDates={data.tourDates}
		/>
	</div>
</div>

<!-- Link Edit Dialog -->
<LinkEditDialog link={editingLink} {themeColors} onclose={closeLinkDialog} />

<!-- Tour Date Edit Dialog -->
<TourDateEditDialog
	tourDate={editingTourDate}
	googleApiKey={data.googleConfig?.placesEnabled ? data.googleConfig.apiKey : null}
	onclose={closeTourDateDialog}
/>
