<script lang="ts">
	import type { Block, Profile, Link, TourDate, Media, ImagesBlockConfig } from '$lib/server/schema';

	let {
		block,
		profile,
		links,
		tourDates,
		media,
		locale
	}: {
		block: Block;
		profile: Profile;
		links: Link[];
		tourDates: TourDate[];
		media: Media[];
		locale: string;
	} = $props();

	const config = $derived((block.config as ImagesBlockConfig) ?? {});
	const displayAs = $derived(config.displayAs ?? 'grid');

	// Get media items referenced by this block's config
	const blockMedia = $derived(
		config.mediaIds
			? config.mediaIds
					.map((id) => media.find((m) => m.id === id))
					.filter((m): m is Media => m !== undefined)
			: []
	);
</script>

{#if blockMedia.length > 0}
	<section class="mb-8">
		{#if config.heading}
			<h2 class="mb-3 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--color-accent)">{config.heading}</h2>
		{/if}

		{#if displayAs === 'grid'}
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each blockMedia as item (item.id)}
					<a
						href={item.originalUrl || item.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10"
					>
						<img
							src={item.thumbnailUrl || item.url}
							alt={item.alt || item.filename}
							loading="lazy"
							class="aspect-square w-full object-cover transition-transform group-hover:scale-105"
						/>
					</a>
				{/each}
			</div>
		{:else if displayAs === 'carousel'}
			<div class="flex gap-3 overflow-x-auto pb-2" style="-webkit-overflow-scrolling: touch;">
				{#each blockMedia as item (item.id)}
					<a
						href={item.originalUrl || item.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group flex-shrink-0 overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10"
					>
						<img
							src={item.thumbnailUrl || item.url}
							alt={item.alt || item.filename}
							loading="lazy"
							class="h-48 w-48 object-cover transition-transform group-hover:scale-105 sm:h-56 sm:w-56"
						/>
					</a>
				{/each}
			</div>
		{:else if displayAs === 'download'}
			<div class="space-y-2">
				{#each blockMedia as item (item.id)}
					<a
						href={item.originalUrl || item.url}
						download={item.filename}
						class="group flex items-center gap-3 rounded-xl bg-white/5 p-3 transition-all hover:bg-white/10"
					>
						{#if item.thumbnailUrl}
							<img
								src={item.thumbnailUrl}
								alt={item.alt || item.filename}
								loading="lazy"
								class="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
							/>
						{:else}
							<div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
								<svg class="h-5 w-5" style="color: var(--color-text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
								</svg>
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium" style="color: var(--color-text)">{item.alt || item.filename}</p>
							{#if item.originalSize}
								<p class="text-xs" style="color: var(--color-text-muted)">{(item.originalSize / 1024 / 1024).toFixed(1)} MB</p>
							{/if}
						</div>
						<svg class="h-5 w-5 flex-shrink-0" style="color: var(--color-text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
					</a>
				{/each}
			</div>
		{/if}
	</section>
{/if}
