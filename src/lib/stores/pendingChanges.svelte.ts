/**
 * Simple pending changes store.
 * Tracks whether there are unpublished changes and handles publish.
 */

import { getState, setSaving, commitSave } from './pageDraft.svelte';

let publishCallback: (() => Promise<void>) | null = null;

export function registerPublishHandler(handler: () => Promise<void>) {
  publishCallback = handler;
}

export function clearPublishHandler() {
  publishCallback = null;
}

export function getPendingState() {
  // Call getState() fresh each time to ensure proper reactivity tracking
  const state = getState();
  return {
    get isDirty() {
      return state.isDirty;
    },
    get saving() {
      return state.saving;
    }
  };
}

/**
 * Publish - commits current draft to real data tables
 */
export async function publish() {
  const state = getState();
  if (!publishCallback || state.saving) return;
  setSaving(true);
  try {
    await publishCallback();
    commitSave();
  } finally {
    setSaving(false);
  }
}
