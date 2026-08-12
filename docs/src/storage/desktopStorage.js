// Tauri-backed storage for the desktop deployment.
//
// This repo has no bundler, so the fs/dialog plugin JS can't be pulled in via
// bare npm imports (`@tauri-apps/plugin-fs` etc.) - a plain browser/webview can't
// resolve those specifiers without one. Instead, with `app.withGlobalTauri: true`
// (see src-tauri/tauri.conf.json) and the plugins registered on the Rust side
// (src-tauri/src/lib.rs), Tauri injects each plugin's API directly onto
// `window.__TAURI__` at runtime, so it's read off there instead.
//
// Also requires capabilities granted in src-tauri/capabilities/default.json:
//   fs:allow-document-read-recursive, fs:allow-document-write-recursive,
//   dialog:allow-open, dialog:allow-save
const { readTextFile, writeTextFile, exists, mkdir, copyFile, BaseDirectory } = window.__TAURI__.fs;
const { open: openDialog, save: saveDialog } = window.__TAURI__.dialog;

const CANONICAL_DIR = 'BubbleMap';
const CANONICAL_FILE = 'BubbleMap/bubbles.json'; // resolved relative to BaseDirectory.Document

async function ensureCanonicalFile() {
  if (!(await exists(CANONICAL_DIR, { baseDir: BaseDirectory.Document }))) {
    await mkdir(CANONICAL_DIR, { baseDir: BaseDirectory.Document, recursive: true });
  }
  if (!(await exists(CANONICAL_FILE, { baseDir: BaseDirectory.Document }))) {
    await writeTextFile(CANONICAL_FILE, '[]', { baseDir: BaseDirectory.Document });
  }
}

async function load() {
  await ensureCanonicalFile();
  const content = await readTextFile(CANONICAL_FILE, { baseDir: BaseDirectory.Document });
  return JSON.parse(content);
}

async function save(data) {
  await ensureCanonicalFile();
  await writeTextFile(CANONICAL_FILE, JSON.stringify(data, null, 2), { baseDir: BaseDirectory.Document });
}

// Copies the always-up-to-date canonical file to a location the user picks, rather
// than re-serializing `data` - canonical storage is already current after every
// mutation, so a literal file copy is simplest and matches "copy this database
// somewhere else" exactly.
async function exportBackup() {
  await ensureCanonicalFile();
  const destPath = await saveDialog({
    title: 'Save BubbleMap Backup',
    defaultPath: 'bubblemap-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!destPath) return; // user cancelled
  await copyFile(CANONICAL_FILE, destPath, { fromPathBaseDir: BaseDirectory.Document });
}

async function importBackup() {
  const path = await openDialog({
    title: 'Recall BubbleMap Backup',
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!path) return null; // user cancelled
  return JSON.parse(await readTextFile(path));
}

export default { load, save, exportBackup, importBackup };
