<script lang="ts">
  import PageEditor from '$lib/components/admin/PageEditor.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PageEditor
  pageId={data.pageId}
  pages={data.pages}
  acts={data.acts}
  media={data.media}
  settings={data.settings}
  googleConfig={data.googleConfig}
/>
