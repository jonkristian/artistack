<script lang="ts">
	interface Props {
		embedId: string;
		embedType: 'track' | 'album' | 'playlist' | 'artist';
		theme?: 'dark' | 'light';
		compact?: boolean;
	}

	let {
		embedId,
		embedType,
		theme = 'dark',
		compact = false
	}: Props = $props();

	// Build the embed URL
	const embedUrl = $derived.by(() => {
		// Theme: 0 = dark, 1 = light (but Spotify now auto-detects, theme param may be ignored)
		const themeParam = theme === 'light' ? '1' : '0';
		return `https://open.spotify.com/embed/${embedType}/${embedId}?utm_source=generator&theme=${themeParam}`;
	});

	// Height based on compact mode
	// Compact: 152px, Full: 352px for tracks/albums, 380px for playlists
	const height = $derived.by(() => {
		if (compact) return '152';
		if (embedType === 'playlist') return '380';
		return '352';
	});
</script>

<div class="spotify-embed overflow-hidden rounded-xl">
	<iframe
		style="border-radius: 12px; width: 100%; height: {height}px;"
		src={embedUrl}
		frameborder="0"
		allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
		loading="lazy"
		title="Spotify Player"
	></iframe>
</div>
