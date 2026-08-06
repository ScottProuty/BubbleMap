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
    color: color && typeof color === 'object' ? color : { h: 0, s: 70, l: 55 },
    description: ''
  };
  all.push(bubble);
  await persist(all);
  return bubble;
}

export async function updateBubble(id, updates) {
  const all = await load();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const existing = all[idx];
  const merged = {
    ...existing,
    description: updates.description !== undefined ? updates.description : existing.description,
    parents: updates.parents !== undefined ? updates.parents : existing.parents,
    color: updates.color !== undefined ? updates.color : existing.color,
    done: updates.done !== undefined ? updates.done : existing.done,
    title: updates.title !== undefined && String(updates.title).trim() ? String(updates.title).trim() : existing.title
  };
  all[idx] = merged;
  await persist(all);
  return merged;
}

export async function deleteBubble(id) {
  const all = await load();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  all.forEach((b) => {
    if (b.parents.includes(id)) {
      b.parents = b.parents.filter((p) => p !== id);
    }
  });
  await persist(all);
  return true;
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
  deleteBubble,
  exportBackup,
  importBackup,
  replaceAll
};
