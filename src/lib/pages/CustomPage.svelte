<script lang="ts">
  import SiteBackground from './SiteBackground.svelte';
  import { resolveTheme } from '$lib/themes';
  import type { Profile, Block, Link, Show, Media } from '$lib/server/schema';
  import type { PublicSettings } from '$lib/server/settings';

  /**
   * An ordinary page: the site's layout, drawing this page's blocks.
   *
   * The same theme as the artist page on purpose — a page at /about should
   * look like the site it belongs to, and the theme already renders whatever
   * blocks it's handed. What differs is which blocks those are.
   */
  let {
    profile,
    settings,
    blocks,
    links,
    shows,
    media
  }: {
    profile: Profile;
    settings: PublicSettings | null;
    blocks: Block[];
    links: Link[];
    shows: Show[];
    media: Media[];
  } = $props();

  const Layout = $derived(resolveTheme(settings?.layout));
</script>

<SiteBackground {settings}>
  <Layout {profile} {settings} {links} {shows} {blocks} {media} />
</SiteBackground>
