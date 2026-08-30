<script lang="ts">
  /**
   * Advertising pixels for the public site.
   *
   * Rendered only when the feature is switched on and an id is set, so a site
   * that isn't advertising ships no third-party script at all.
   *
   * These set cookies on a visitor's browser for Meta and TikTok. In the EEA
   * that needs consent before the script loads, not after — so if you add a
   * consent banner, this component is what it must gate.
   */
  interface Props {
    metaPixelId?: string | null;
    tiktokPixelId?: string | null;
  }

  let { metaPixelId = null, tiktokPixelId = null }: Props = $props();
</script>

<svelte:head>
  {#if metaPixelId}
    {@html `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(metaPixelId)});
fbq('track', 'PageView');
</script>`}
  {/if}

  {#if tiktokPixelId}
    {@html `<script>
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
ttq.load(${JSON.stringify(tiktokPixelId)});
ttq.page();
}(window, document, 'ttq');
</script>`}
  {/if}
</svelte:head>
