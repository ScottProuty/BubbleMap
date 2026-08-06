// Tauri-backed storage for the desktop deployment.
//
// NOT FUNCTIONAL YET. This module assumes a Tauri v2 project will be scaffolded
// around this app in a later, separate task, providing:
//   - npm packages @tauri-apps/plugin-fs and @tauri-apps/plugin-dialog
//   - a bundler (e.g. Vite) in that scaffolded project, since these are
//     bare-specifier npm imports that a plain browser (or an unbundled webview)
//     can't resolve - this repo currently has no bundler, so this file can't be
//     exercised until scaffolding adds one
//   - the fs/dialog plugins registered on the Rust side (src-tauri/src/main.rs)
//   - capabilities granted in src-tauri/capabilities/default.json, at minimum:
//       fs:allow-read-text-file, fs:allow-write-text-file, fs:allow-exists,
//       fs:allow-mkdir, fs:allow-copy-file - scoped to $DOCUMENT/Pop/**
//       dialog:allow-open, dialog:allow-save
import { readTextFile, writeTextFile, exists, mkdir, copyFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

const CANONICAL_DIR = 'Pop';
const CANONICAL_FILE = 'Pop/bubbles.json'; // resolved relative to BaseDirectory.Document

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
    title: 'Save Pop Backup',
    defaultPath: 'pop-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!destPath) return; // user cancelled
  await copyFile(CANONICAL_FILE, destPath, { fromPathBaseDir: BaseDirectory.Document });
}

async function importBackup() {
  const path = await openDialog({
    title: 'Recall Pop Backup',
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!path) return null; // user cancelled
  return JSON.parse(await readTextFile(path));
}

export default { load, save, exportBackup, importBackup };
