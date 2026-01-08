<script lang="ts">
	interface Props {
		embedId: string;
		embedType: 'album' | 'track';
		title?: string;
		bgColor?: string;
		linkColor?: string;
		size?: 'small' | 'large';
		tracklist?: boolean;
		artwork?: 'small' | 'large' | 'none';
	}

	let {
		embedId,
		embedType,
		title = '',
		bgColor = 'ffffff',
		linkColor = '8b5cf6',
		size = 'small',
		tracklist = true,
		artwork = 'small'
	}: Props = $props();

	// Build the embed URL with all parameters
	// Note: Bandcamp only supports white (ffffff) or gray backgrounds - custom dark colors don't work
	const embedUrl = $derived.by(() => {
		const bg = bgColor.replace('#', '');
		const link = linkColor.replace('#', '');

		// Use the passed bgColor - Bandcamp will show gray for dark colors, white for light
		let url = `https://bandcamp.com/EmbeddedPlayer/v=2/${embedType}=${embedId}/size=${size}/bgcol=${bg}/linkcol=${link}/`;

		// Add options for large size
		if (size === 'large') {
			if (!tracklist) {
				url += `tracklist=false/`;
			}
			// Always specify artwork for v=2
			url += `artwork=${artwork}/`;
		}

		return url;
	});

	// Height based on size, artwork, and tracklist
	// small = slim player bar (42px)
	// large with tracklist = 470px (shows full track list with controls)
	// large without tracklist + artwork=small = 120px
	// large without tracklist + artwork=large = 350px (hover to play)
	// large without tracklist + artwork=none = 42px
	const height = $derived.by(() => {
		if (size === 'small') return '42';
		if (tracklist) return '470';
		if (artwork === 'none') return '42';
		if (artwork === 'small') return '120';
		return '350';
	});
</script>

<div class="bandcamp-embed overflow-hidden rounded-xl" style="min-height: {height}px;">
	<iframe
		style="border: 0; width: 100%; height: {height}px;"
		src={embedUrl}
		seamless
		title={title || 'Bandcamp Player'}
		loading="lazy"
		allow="autoplay; encrypted-media"
		referrerpolicy="no-referrer-when-downgrade"
	></iframe>
</div>
