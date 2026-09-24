// CRUD orchestration on top of the raw storage.load()/storage.save() primitives.
// Every method here reads the full bubble array and writes it back, so a mutation
// to one bubble can never clobber bubbles that aren't currently rendered on
// screen (e.g. done bubbles hidden by the "Show Completed" setting).

import { getStorage } from './storage.js';

async function load() {
  const storage = await getStorage();
  return storage.load();
}

async function persist(all) {
  const storage = await getStorage();
  return storage.save(all);
}

export async function listBubbles() {
  return load();
}

export async function getBubble(id) {
  return (await load()).find((b) => b.id === id) || null;
}

export async function createBubble({ title, color, parents }) {
  const all = await load();
  const bubble = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    created: new Date().toISOString(),
    done: '',
    parents: Array.isArray(parents) ? parents : [],
    color: color && typeof color === 'object' ? color : { h: 0, s: 0.5, l: 0.5 },
    description: ''
  };
  all.push(bubble);
  await persist(all);
  return bubble;
}

function mergeUpdates(existing, updates) {
  return {
    ...existing,
    description: updates.description !== undefined ? updates.description : existing.description,
    parents: updates.parents !== undefined ? updates.parents : existing.parents,
    color: updates.color !== undefined ? updates.color : existing.color,
    done: updates.done !== undefined ? updates.done : existing.done,
    title: updates.title !== undefined && String(updates.title).trim() ? String(updates.title).trim() : existing.title
  };
}

export async function updateBubble(id, updates) {
  const all = await load();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const merged = mergeUpdates(all[idx], updates);
  all[idx] = merged;
  await persist(all);
  return merged;
}

// Applies a different `updates` object per id in one load/persist round trip -
// for cases like color propagation where each affected bubble ends up with a
// different color/parents, so updateBubbles()'s single shared `updates` won't do.
export async function updateBubblesById(entries) {
  const updatesById = new Map(entries.map((e) => [e.id, e.updates]));
  const all = await load();
  const updated = [];
  all.forEach((b, idx) => {
    const updates = updatesById.get(b.id);
    if (!updates) return;
    const merged = mergeUpdates(b, updates);
    all[idx] = merged;
    updated.push(merged);
  });
  await persist(all);
  return updated;
}

export async function deleteBubble(id) {
  return deleteBubbles([id]);
}

// Deletes all given ids in a single load/persist round trip, so the writes
// can't race each other and clobber one another the way sequential
// deleteBubble() calls would.
export async function deleteBubbles(ids) {
  const idSet = new Set(ids);
  const all = await load();
  const remaining = all.filter((b) => !idSet.has(b.id));
  if (remaining.length === all.length) return false;
  remaining.forEach((b) => {
    if (b.parents.some((p) => idSet.has(p))) {
      b.parents = b.parents.filter((p) => !idSet.has(p));
    }
  });
  await persist(remaining);
  return true;
}

// Applies the same `updates` (e.g. a done-state change) to every id in one
// load/persist round trip, for the same reason as deleteBubbles above.
export async function updateBubbles(ids, updates) {
  const idSet = new Set(ids);
  const all = await load();
  const updated = [];
  all.forEach((b, idx) => {
    if (!idSet.has(b.id)) return;
    const merged = mergeUpdates(b, updates);
    all[idx] = merged;
    updated.push(merged);
  });
  await persist(all);
  return updated;
}

export async function exportBackup() {
  const storage = await getStorage();
  return storage.exportBackup(await load());
}

export async function importBackup() {
  const storage = await getStorage();
  const data = await storage.importBackup();
  if (!data) return null; // cancelled
  if (!Array.isArray(data)) throw new Error('Invalid backup file');
  return data;
}

export async function replaceAll(data) {
  await persist(data);
}

export default {
  listBubbles,
  getBubble,
  createBubble,
  updateBubble,
  updateBubbles,
  updateBubblesById,
  deleteBubble,
  deleteBubbles,
  exportBackup,
  importBackup,
  replaceAll
};
