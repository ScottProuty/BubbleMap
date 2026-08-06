// IndexedDB-backed storage for the plain-browser (GitHub Pages) deployment. The
// whole bubble document is stored as a single JSON-serializable value under a
// fixed key, mirroring how bubbles.json is "one JSON blob" server-side.

const DB_NAME = 'PopDB';
const DB_VERSION = 1;
const STORE_NAME = 'bubblesStore';
const DOC_KEY = 'doc';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB open request is blocked'));
    });
  }
  return dbPromise;
}

async function load() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(DOC_KEY);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('Failed to read from IndexedDB'));
  });
}

async function save(data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, DOC_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to write to IndexedDB'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write was aborted'));
  });
}

async function exportBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pop-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (e) {
          reject(new Error('That file is not valid JSON.'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read the selected file'));
      reader.readAsText(file);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export default { load, save, exportBackup, importBackup };
