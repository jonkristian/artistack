<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  /**
   * Advertising pixels for the public site.
   *
   * Rendered only when the feature is switched on and an id is set, so a site
   * that isn't advertising ships no third-party script at all.
   *
   * These set cookies on a visitor's browser for Meta and TikTok. In the EEA
   * that needs consent before the script loads, not after — so if you add a
   * consent banner, this component is what it must gate.
   *
   * The two snippets are built here rather than written inline in the markup.
   * They used to sit in the template as `{@html `<script>…`}`, which reads
   * fine and broke Vite's dependency scanner: it finds every `<script>` in a
   * component and parses the contents as JavaScript, so it hit the `${…}` of
   * a template literal, failed, and silently skipped pre-bundling for the whole
   * dev server. Built as strings up here there is only one script block in the
   * file, and the closing tags are escaped as `<\/script>` so they don't end it
   * early — which is why that escape is load-bearing rather than decorative.
   */
  interface Props {
    metaPixelId?: string | null;
    tiktokPixelId?: string | null;
  }

  let { metaPixelId = null, tiktokPixelId = null }: Props = $props();

  /*
   * The snippets fire a page view once, as the page loads. A page reached
   * without a load needs telling them about, or an ad platform only ever sees
   * the page someone landed on.
   */
  afterNavigate(({ type, from, to }) => {
    if (type === 'enter' || !to || to.url.pathname === from?.url.pathname) return;
    const w = window as unknown as {
      fbq?: (...args: unknown[]) => void;
      ttq?: { page: () => void };
    };
    if (metaPixelId) w.fbq?.('track', 'PageView');
    if (tiktokPixelId) w.ttq?.page();
  });

  /** Meta's standard pixel loader, with the id interpolated as a JSON literal. */
  function metaSnippet(id: string): string {
    return `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(id)});
fbq('track', 'PageView');
<\/script>`;
  }

  /** TikTok's equivalent. */
  function tiktokSnippet(id: string): string {
    return `<script>
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};
ttq.load(${JSON.stringify(id)});
ttq.page();
}(window, document, 'ttq');
<\/script>`;
  }
</script>

<svelte:head>
  {#if metaPixelId}
    {@html metaSnippet(metaPixelId)}
  {/if}

  {#if tiktokPixelId}
    {@html tiktokSnippet(tiktokPixelId)}
  {/if}
</svelte:head>
