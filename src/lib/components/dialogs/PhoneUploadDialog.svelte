<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import {
    startPhoneUpload,
    phoneUploadStatus,
    endPhoneUpload,
    requoteUploadQr
  } from '$lib/upload-qr.remote';

  interface Props {
    open?: boolean;
    /** Bind uploads to a clip project, so footage lands straight in as sources. */
    projectId?: number | null;
    label?: string | null;
  }

  let { open = $bindable(false), projectId = null, label = null }: Props = $props();

  interface Qr {
    sessionId: number;
    url: string;
    svg: string;
    unreachable: boolean;
    alternatives: string[];
    substituted: boolean;
    expiresAt: string | Date;
  }

  let qr = $state<Qr | null>(null);
  let loading = $state(false);
  let uploadCount = $state(0);
  let expired = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onDestroy(stopPolling);

  // Opening the dialog is what mints the session — no token exists until
  // someone actually asks for one.
  $effect(() => {
    if (open && !qr && !loading) void begin();
    if (!open) stopPolling();
  });

  async function begin() {
    loading = true;
    try {
      const result = await startPhoneUpload({
        origin: window.location.origin,
        label,
        projectId
      });
      qr = result;
      uploadCount = 0;
      expired = false;
      startPolling(result.sessionId);
    } catch {
      toast.error('Could not create an upload link');
      open = false;
    } finally {
      loading = false;
    }
  }

  function startPolling(sessionId: number) {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const status = await phoneUploadStatus(sessionId);
        if (!status) return;

        // Each arrival should show up in the library behind the dialog, so the
        // page data is refreshed rather than just the counter.
        if (status.uploadCount !== uploadCount) {
          uploadCount = status.uploadCount;
          await invalidateAll();
        }

        if (status.expired || status.revoked) {
          expired = true;
          stopPolling();
        }
      } catch {
        // A dropped poll is harmless; the next tick retries.
      }
    }, 2000);
  }

  async function useOrigin(origin: string) {
    if (!qr) return;
    const updated = await requoteUploadQr({ sessionId: qr.sessionId, origin });
    if (updated) qr = { ...qr, ...updated };
  }

  async function close() {
    stopPolling();
    // The token stays valid until it's revoked, so closing without ending the
    // session would leave a live capability floating around.
    if (qr && !expired) await endPhoneUpload(qr.sessionId).catch(() => {});
    if (uploadCount > 0) toast.success(`${uploadCount} file(s) uploaded`);
    qr = null;
    uploadCount = 0;
    open = false;
  }

  function copyLink() {
    if (!qr) return;
    navigator.clipboard.writeText(qr.url);
    toast.success('Link copied');
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-label="Upload from phone"
    tabindex="-1"
  >
    <div class="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900">
      <div class="flex items-center justify-between border-b border-gray-700 p-4">
        <h2 class="font-semibold text-white">Upload from phone</h2>
        <button onclick={close} class="text-gray-400 hover:text-white" aria-label="Close">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="p-5">
        {#if loading || !qr}
          <div class="flex h-64 items-center justify-center">
            <div
              class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-white"
            ></div>
          </div>
        {:else if expired}
          <div class="py-10 text-center">
            <p class="text-sm text-gray-400">This link has ended.</p>
            <button
              onclick={begin}
              class="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              New code
            </button>
          </div>
        {:else}
          <p class="mb-4 text-center text-sm text-gray-400">
            Scan with your phone's camera to open an upload page.
          </p>

          <!-- White plate: a QR on a dark background won't scan reliably. -->
          <div class="mx-auto mb-4 w-52 rounded-lg bg-white p-3">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html qr.svg}
          </div>

          {#if qr.unreachable}
            <p
              class="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/40 p-3 text-xs text-amber-200"
            >
              This server is only reachable at localhost, so a phone can't open the link. Run it on
              your network interface, or set a public URL.
            </p>
          {:else if qr.substituted}
            <div class="mb-3">
              <p
                class="mb-2 rounded-lg border border-gray-700 bg-gray-950 p-2 text-xs text-gray-400"
              >
                You're on localhost, so this points at a network address instead. The server has to
                be listening on it — in development that means
                <code class="text-gray-300">vite dev --host</code>.
              </p>
              {#if qr.alternatives.length > 1}
                <p class="mb-1 text-xs text-gray-500">
                  If your phone can't reach it, try another address:
                </p>
              {/if}
              <div class="flex flex-wrap gap-1">
                {#each qr.alternatives as alt (alt)}
                  <button
                    onclick={() => useOrigin(alt)}
                    class="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                  >
                    {new URL(alt).hostname}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <button
            onclick={copyLink}
            class="mb-4 w-full truncate rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-violet-400 hover:bg-gray-800"
            title="Copy link"
          >
            {qr.url}
          </button>

          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">
              {#if uploadCount === 0}
                Waiting for uploads…
              {:else}
                {uploadCount} file{uploadCount === 1 ? '' : 's'} received
              {/if}
            </span>
            <button
              onclick={close}
              class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
            >
              Done
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
