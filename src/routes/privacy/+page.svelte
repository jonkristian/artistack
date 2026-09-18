<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const settings = $derived(data.settings);
  const profile = $derived(data.profile);
  const siteName = $derived(settings?.siteTitle || profile?.name || 'This site');

  /*
   * The advertising paragraphs are written only when there is advertising to
   * describe. A policy that claims no tracking cookies while the pixels are
   * loading is worse than no policy — it is a statement that is checkably
   * false — and one that describes pixels on a site carrying none is just as
   * wrong in the other direction.
   *
   * Note this makes the page honest, not lawful: naming a tracker is not the
   * same as asking permission before loading it. See TrackingPixels.svelte.
   */
  const pixels = $derived(data.pixels ?? null);
  const pixelNames = $derived(
    [
      pixels?.metaPixelId ? 'Meta (Facebook and Instagram)' : null,
      pixels?.tiktokPixelId ? 'TikTok' : null
    ]
      .filter(Boolean)
      .join(' and ')
  );
</script>

<svelte:head>
  <title>Privacy & Terms — {siteName}</title>
  <meta name="description" content="Privacy policy and terms of service for {siteName}." />
  {@html `<style>html, body { background-color: ${settings?.colorBg ?? '#0c0a14'}; }</style>`}
</svelte:head>

<div
  class="pointer-events-none fixed inset-0 z-50 opacity-[0.04]"
  style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 512 512%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%222%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
></div>

<main
  class="relative z-10 mx-auto max-w-2xl px-6 py-16"
  style="
    --color-bg: {settings?.colorBg ?? '#0c0a14'};
    --color-card: {settings?.colorCard ?? '#14101f'};
    --color-accent: {settings?.colorAccent ?? '#8b5cf6'};
    --color-text: {settings?.colorText ?? '#f4f4f5'};
    --color-text-muted: {settings?.colorTextMuted ?? '#a1a1aa'};
  "
>
  <a
    href="/"
    class="mb-12 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
    style="color: var(--color-text-muted)"
  >
    &larr; Back
  </a>

  <article class="space-y-12">
    <!-- Privacy Policy -->
    <section class="space-y-5">
      <h1 class="text-3xl font-bold tracking-tight" style="color: var(--color-text)">
        Privacy Policy
      </h1>

      <div class="space-y-4 text-sm leading-relaxed" style="color: var(--color-text-muted)">
        <p>
          <strong style="color: var(--color-text)">Last updated:</strong> February 2026
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">
          Information We Collect
        </h2>
        <p>
          This site is primarily a public link hub. We do not require visitors to create accounts or
          submit personal information. We count visits ourselves rather than handing that job to
          anyone else: each one records the page, the referring site, a country worked out from your
          IP address, and whether you were on a phone, a tablet or a computer. Your IP address is
          used for that lookup and is not stored.
        </p>
        <p>
          To tell a returning reader from a new one within a single day, we store a code made from
          your IP address and browser, scrambled with a random value that is discarded every night.
          The code cannot be turned back into your address, and the same visitor produces a
          different code tomorrow, so it cannot be used to follow anyone over time.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">Cookies</h2>
        <p>
          We use minimal cookies required for site functionality — an admin session, a basket while
          you shop, and a note of which music service you last chose. Our own visit counting sets no
          cookie at all.
        </p>
        {#if pixels}
          <p>
            This site also loads advertising pixels from {pixelNames}, which set their own cookies
            in your browser and report your visit back to {pixelNames} so that advertising can be measured.
            These are set by {pixelNames} and are governed by their privacy policies, not ours.
          </p>
        {:else}
          <p>We do not use advertising or cross-site tracking cookies.</p>
        {/if}

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">
          Third-Party Services
        </h2>
        <p>
          This site may embed content from third-party platforms such as Spotify, YouTube,
          SoundCloud, or social media networks. These embeds are governed by their respective
          privacy policies.
        </p>
        {#if pixels?.metaServerClicks}
          <!-- Meta only: it's the one sent from the server. Naming TikTok here
               described something that never happens. -->
          <p>
            While advertising measurement is switched on, we also send Meta a record of clicks on
            our music links directly from our server, including your IP address and browser. This
            happens whether or not the pixel loaded in your browser.
          </p>
        {/if}

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">Data Retention</h2>
        <p>
          Individual visit and click records are kept for 90 days and then reduced to daily totals,
          which carry no record of any single visit. We do not sell personal data.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">Contact</h2>
        <p>
          If you have questions about this privacy policy, please reach out via the contact
          information listed on the main page.
        </p>
      </div>
    </section>

    <hr class="border-white/10" />

    <!-- Terms of Service -->
    <section class="space-y-5">
      <h1 class="text-3xl font-bold tracking-tight" style="color: var(--color-text)">
        Terms of Service
      </h1>

      <div class="space-y-4 text-sm leading-relaxed" style="color: var(--color-text-muted)">
        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">Use of Site</h2>
        <p>
          This site serves as a personal link hub and promotional page. All content, including
          images, text, and media, is provided for informational and promotional purposes. You may
          browse freely, but reproduction or redistribution of content without permission is
          prohibited.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">
          Intellectual Property
        </h2>
        <p>
          All original content on this site — including artwork, music, photography, and branding —
          is the property of the site owner or used with permission. Third-party trademarks and
          content belong to their respective owners.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">External Links</h2>
        <p>
          This site contains links to external platforms and services. We are not responsible for
          the content, availability, or privacy practices of those sites. Clicking external links is
          at your own discretion.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">
          Limitation of Liability
        </h2>
        <p>
          This site is provided "as is" without warranties of any kind. We are not liable for any
          damages arising from your use of the site or reliance on its content.
        </p>

        <h2 class="!mt-8 text-lg font-semibold" style="color: var(--color-text)">Changes</h2>
        <p>
          We reserve the right to update these terms and the privacy policy at any time. Continued
          use of the site constitutes acceptance of any changes.
        </p>
      </div>
    </section>
  </article>

  <footer class="mt-16 text-xs" style="color: var(--color-text-muted); opacity: 0.5">
    &copy; {new Date().getFullYear()}
    {siteName}
  </footer>
</main>
