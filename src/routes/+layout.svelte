<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>Artistack</title>
  <meta name="description" content="Artist link hub" />
</svelte:head>

{@render children()}
