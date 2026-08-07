// Environment-detecting storage factory. Picks the IndexedDB-backed implementation
// in a plain browser, or the Tauri file-based implementation when running inside a
// Tauri desktop shell. Both implementations expose the same shape:
//   { load(), save(data), exportBackup(data), importBackup() }
//
// Uses '__TAURI_INTERNALS__' rather than '__TAURI__', since the latter is only
// injected when tauri.conf.json sets app.withGlobalTauri (off by default in
// Tauri v2) - __TAURI_INTERNALS__ is the object @tauri-apps/api itself relies on
// internally, so it's always present in a real Tauri webview regardless of that
// setting.
//
// The dynamic import() below is what lets this run in a plain static/GitHub Pages
// deployment at all: desktopStorage.js imports Tauri npm packages as bare
// specifiers that a bundler-free browser can't resolve, but since that branch is
// only ever imported when isTauri() is true, the browser never attempts to fetch
// or evaluate it on a non-Tauri deployment.

export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let storagePromise = null;

export function getStorage() {
  if (!storagePromise) {
    storagePromise = isTauri()
      ? import('./desktopStorage.js').then((m) => m.default)
      : import('./webStorage.js').then((m) => m.default);
  }
  return storagePromise;
}
