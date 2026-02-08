/**
 * Generic draft store for page builder.
 *
 * Components modify draft.data directly - Svelte 5's $state is deeply reactive.
 * isDirty is computed automatically by comparing draft vs snapshot.
 * On save, the page computes diffs and persists changes.
 */

// ===== State =====

const defaultData = {
  profile: { id: 0, name: '' },
  blocks: [] as any[],
  links: [] as any[],
  tourDates: [] as any[]
};

let snapshot: Record<string, any> = {};
let data = $state<Record<string, any>>({ ...defaultData });
let saving = $state(false);
let tempIdCounter = $state(-1);
let initialized = $state(false);

// Track snapshot as JSON for comparison
let snapshotJson = $state('');

// ===== Helpers =====

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ===== Public API =====

/**
 * Initialize with server data. Call this when page loads.
 */
export function initialize<T extends Record<string, any>>(serverData: T) {
  snapshot = deepClone(serverData);
  snapshotJson = JSON.stringify(snapshot);
  // Update data in place to preserve reactivity references
  const newData = deepClone(serverData);
  for (const key of Object.keys(data)) {
    if (!(key in newData)) {
      delete data[key];
    }
  }
  for (const [key, value] of Object.entries(newData)) {
    data[key] = value;
  }
  tempIdCounter = -1;
  initialized = true;
}

/**
 * Get a temp ID for new items (negative = unsaved)
 */
export function getTempId(): number {
  return tempIdCounter--;
}

/**
 * The reactive draft data. Components read/write directly.
 */
export function getData<T extends Record<string, any>>(): T {
  return data as T;
}

/**
 * Check if a specific key has changes
 */
export function hasChanges(key: string): boolean {
  return !deepEqual(data[key], snapshot[key]);
}

/**
 * Get the snapshot value for a key (for computing diffs)
 */
export function getSnapshot<T>(key: string): T {
  return snapshot[key] as T;
}

/**
 * Get reactive state for UI
 */
export function getState() {
  return {
    get isDirty() {
      return initialized && JSON.stringify(data) !== snapshotJson;
    },
    get saving() {
      return saving;
    }
  };
}

/**
 * Check if there are unsaved changes (for direct use in $derived)
 */
export function isDirty(): boolean {
  if (!initialized) return false;
  return JSON.stringify(data) !== snapshotJson;
}

/**
 * Check if currently saving (for direct use in $derived)
 */
export function isSaving(): boolean {
  return saving;
}

/**
 * Compute what changed for a collection (arrays with id field)
 */
export function computeCollectionDiff<T extends { id: number }>(
  key: string
): {
  added: T[];
  updated: { id: number; changes: Partial<T> }[];
  deleted: number[];
  reordered: boolean;
} {
  const savedItems = (snapshot[key] ?? []) as T[];
  const draftItems = (data[key] ?? []) as T[];

  const savedMap = new Map(savedItems.map((item) => [item.id, item]));
  const draftMap = new Map(draftItems.map((item) => [item.id, item]));

  const added: T[] = [];
  const updated: { id: number; changes: Partial<T> }[] = [];
  const deleted: number[] = [];

  // Find added and updated
  for (const item of draftItems) {
    if (item.id < 0) {
      added.push(item);
    } else {
      const savedItem = savedMap.get(item.id);
      if (savedItem && !deepEqual(item, savedItem)) {
        const changes: Partial<T> = {};
        for (const k of Object.keys(item) as (keyof T)[]) {
          if (!deepEqual(item[k], savedItem[k])) {
            changes[k] = item[k];
          }
        }
        if (Object.keys(changes).length > 0) {
          updated.push({ id: item.id, changes });
        }
      }
    }
  }

  // Find deleted
  for (const item of savedItems) {
    if (!draftMap.has(item.id)) {
      deleted.push(item.id);
    }
  }

  // Check if order changed
  const savedOrder = savedItems.map((i) => i.id);
  const draftOrder = draftItems.filter((i) => i.id > 0).map((i) => i.id);
  const reordered = !deepEqual(savedOrder, draftOrder);

  return { added, updated, deleted, reordered };
}

/**
 * Compute what changed for a single object (like profile)
 */
export function computeObjectDiff<T extends Record<string, any>>(key: string): Partial<T> | null {
  const saved = snapshot[key] as T | undefined;
  const current = data[key] as T | undefined;

  if (!saved || !current) return null;
  if (deepEqual(saved, current)) return null;

  const changes: Partial<T> = {};
  for (const k of Object.keys(current) as (keyof T)[]) {
    if (!deepEqual(current[k], saved[k])) {
      changes[k] = current[k];
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Mark save as complete - updates snapshot to match draft
 */
export function commitSave() {
  snapshot = deepClone(data);
  snapshotJson = JSON.stringify(snapshot);
  saving = false;
}

/**
 * Set saving state
 */
export function setSaving(value: boolean) {
  saving = value;
}

/**
 * Undo all changes - reset draft to snapshot
 */
export function undo() {
  // Update data in place to preserve reactivity references
  const snapshotData = deepClone(snapshot);
  for (const key of Object.keys(data)) {
    if (!(key in snapshotData)) {
      delete data[key];
    }
  }
  for (const [key, value] of Object.entries(snapshotData)) {
    data[key] = value;
  }
}

/**
 * Reset everything
 */
export function reset() {
  snapshot = {};
  snapshotJson = '{}';
  // Update data in place to preserve reactivity references
  for (const key of Object.keys(data)) {
    if (!(key in defaultData)) {
      delete data[key];
    }
  }
  for (const [key, value] of Object.entries(defaultData)) {
    data[key] = Array.isArray(value) ? [...value] : { ...value };
  }
  saving = false;
  tempIdCounter = -1;
  initialized = false;
}
