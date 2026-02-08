<script lang="ts">
  interface Props {
    videoId: string;
  }

  let { videoId }: Props = $props();

  const embedUrl = $derived(`https://www.youtube.com/embed/${videoId}`);
</script>

<div class="youtube-embed overflow-hidden rounded-xl">
  <iframe
    style="border: 0; width: 100%; aspect-ratio: 16/9;"
    src={embedUrl}
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    loading="lazy"
    title="YouTube Video"
  ></iframe>
</div>
