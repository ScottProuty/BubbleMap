const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUBBLES_DIR = path.join(__dirname, 'Bubbles');
const DATA_FILE = path.join(BUBBLES_DIR, 'bubbles.json');

function ensureFile() {
  if (!fs.existsSync(BUBBLES_DIR)) {
    fs.mkdirSync(BUBBLES_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function load() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Write to a temp file then rename over the real one, so a crash mid-write can't
// leave bubbles.json truncated/corrupt.
function save(all) {
  ensureFile();
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(all, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function listBubbles() {
  return load().filter((b) => !b.deleted);
}

function getBubble(id) {
  return load().find((b) => b.id === id) || null;
}

function createBubble({ title, color, parents }) {
  const all = load();
  const bubble = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    created: new Date().toISOString(),
    done: '',
    parents: Array.isArray(parents) ? parents : [],
    color: color && typeof color === 'object' ? color : { h: 0, s: 70, l: 55 },
    description: '',
    deleted: false
  };
  all.push(bubble);
  save(all);
  return bubble;
}

function updateBubble(id, updates) {
  const all = load();
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
  save(all);
  return merged;
}

function softDeleteBubble(id) {
  const all = load();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], deleted: true };
  all.forEach((b) => {
    if (b.id !== id && b.parents.includes(id)) {
      b.parents = b.parents.filter((p) => p !== id);
    }
  });
  save(all);
  return all[idx];
}

function clearDeleted() {
  save(load().filter((b) => !b.deleted));
}

module.exports = {
  listBubbles,
  getBubble,
  createBubble,
  updateBubble,
  softDeleteBubble,
  clearDeleted,
  BUBBLES_DIR,
  DATA_FILE
};
