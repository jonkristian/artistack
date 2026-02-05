/**
 * Simple bridge between pageDraft store and the sidebar Save/Undo buttons.
 */

import { getState, undo as draftUndo, setSaving, commitSave } from './pageDraft.svelte';

let saveCallback: (() => Promise<void>) | null = null;

const draftState = getState();

export function registerSaveHandler(handler: () => Promise<void>) {
	saveCallback = handler;
}

export function clearSaveHandler() {
	saveCallback = null;
}

export function getPendingState() {
	return {
		get isDirty() { return draftState.isDirty; },
		get saving() { return draftState.saving; }
	};
}

export async function save() {
	if (!saveCallback || draftState.saving) return;
	setSaving(true);
	try {
		await saveCallback();
		commitSave();
	} finally {
		setSaving(false);
	}
}

export function undo() {
	draftUndo();
}
