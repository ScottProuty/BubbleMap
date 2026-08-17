// The Settings panel (physics tuning + show-completed toggle) and backup save/recall.
// It's a sliding panel toggled by the gear button, not a modal - see toggleSettings().
//
// FRAMEWORK - to add a new setting:
//   1. In index.html, add a ".settings-row" inside #settingsBody with a label and
//      an input/select/checkbox for the setting (see the example comment there).
//   2. Add a key + default value for it to the `settings` object in src/state.js.
//   3. In `bindSettingsControls()`, look up the control by id and sync its value from
//      `settings.<key>` (this part runs every time the panel opens). Then, inside the
//      `if (settingsControlsBound) return;` guard, add a change/input listener that
//      updates `settings.<key>` and calls `applySetting('<key>')`. The guard ensures the
//      listener is only attached once, no matter how many times the panel is reopened.
//   4. In `applySetting()`, add a case for `<key>` that makes the setting take effect.

import { dom, settings, physicsParams } from './state.js';
import { wakePhysics } from './physics.js';
import { loadDoneBubbles, hideDoneBubbles, refreshBubbleColors } from './bubbles.js';
import bubbleRepository from './storage/bubbleRepository.js';
import { isTauri } from './storage/storage.js';
import { colorThemeNames, setColorTheme } from './utils.js';

// Settings are only persisted to localStorage on the web (non-Tauri) deployment -
// the desktop build will get its own persistence alongside its file-based bubble
// storage (src/storage/desktopStorage.js) once that's wired up.
const SETTINGS_STORAGE_KEY = 'bubblemap-settings';

function loadPersistedSettings() {
  if (isTauri()) return;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.showCompletedSetting === 'boolean') settings.showCompletedSetting = saved.showCompletedSetting;
    if (Number.isFinite(saved.repelForce)) settings.repelForce = saved.repelForce;
    if (Number.isFinite(saved.maxDistance)) settings.maxDistance = saved.maxDistance;
    if (Number.isFinite(saved.linkDistance)) settings.linkDistance = saved.linkDistance;
    if (typeof saved.colorTheme === 'string' && colorThemeNames().includes(saved.colorTheme)) settings.colorTheme = saved.colorTheme;
  } catch (e) {
    // Corrupt or unavailable localStorage (e.g. private browsing) - fall back to defaults.
  }
  physicsParams.REPEL_FORCE = settings.repelForce;
  physicsParams.MAX_DISTANCE = settings.maxDistance;
  physicsParams.LINK_DISTANCE = settings.linkDistance;
  setColorTheme(settings.colorTheme);
}

// Runs once, as soon as this module is first imported - before BubbleMap.js starts
// physics or anything else that reads `settings`/`physicsParams` - so the saved
// values are already in effect for the very first frame.
loadPersistedSettings();

function persistSettings() {
  if (isTauri()) return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // localStorage unavailable (e.g. private browsing) - settings just won't persist.
  }
}

// True once a setting has actually been changed since the panel was last opened,
// so closeSettings() only writes to localStorage when there's something new to save.
let settingsChangedSinceOpen = false;
let settingsOpen = false;

function openSettings() {
  bindSettingsControls();
  settingsChangedSinceOpen = false;
  settingsOpen = true;
  dom.settingsPanel.classList.add('open');
}

function closeSettings() {
  settingsOpen = false;
  dom.settingsPanel.classList.remove('open');
  if (settingsChangedSinceOpen) {
    persistSettings();
    settingsChangedSinceOpen = false;
  }
}

// The gear button toggles the panel: slides it in from off-screen on the left,
// then slides it back out on the next click. No backdrop - the canvas stays
// interactive (and pannable) behind the panel the whole time.
export function toggleSettings() {
  if (settingsOpen) {
    closeSettings();
  } else {
    openSettings();
  }
}

// True once the settings controls' change/input listeners have been attached. Only the
// value-syncing should happen on every open; listeners are attached a single time.
let settingsControlsBound = false;

// Syncs each settings control to the current value in `settings`, and (the first time
// only) attaches its change listener. Called every time the modal opens.
function bindSettingsControls() {
  const showCompletedInput = document.getElementById('showCompletedSetting');
  const repelForceInput = document.getElementById('repelForceSettingMenu');
  const themeInput = document.getElementById('themeSettingMenu');
  const maxDistanceInput = document.getElementById('maxDistanceSettingMenu');
  const linkDistanceInput = document.getElementById('linkDistanceSettingMenu');

  showCompletedInput.checked = settings.showCompletedSetting;
  repelForceInput.value = settings.repelForce;
  themeInput.value = settings.colorTheme;
  maxDistanceInput.value = settings.maxDistance;
  linkDistanceInput.value = settings.linkDistance;

  if (settingsControlsBound) return;
  settingsControlsBound = true;

  showCompletedInput.addEventListener('change', () => {
    settings.showCompletedSetting = showCompletedInput.checked;
    settingsChangedSinceOpen = true;
    applySetting('showCompletedSetting');
  });

  repelForceInput.addEventListener('change', () => {
    settings.repelForce = parseInt(repelForceInput.value, 10);
    settingsChangedSinceOpen = true;
    applySetting('repelForce');
  });

  themeInput.addEventListener('change', () => {
    settings.colorTheme = themeInput.value;
    settingsChangedSinceOpen = true;
    applySetting('colorTheme');
  });

  maxDistanceInput.addEventListener('change', () => {
    settings.maxDistance = parseInt(maxDistanceInput.value, 10);
    settingsChangedSinceOpen = true;
    applySetting('maxDistance');
  });

  linkDistanceInput.addEventListener('change', () => {
    settings.linkDistance = parseInt(linkDistanceInput.value, 10);
    settingsChangedSinceOpen = true;
    applySetting('linkDistance');
  });
}

// Makes the current value of a single setting take effect in the running app.
function applySetting(key) {
  switch (key) {
    case 'showCompletedSetting':
      if (settings.showCompletedSetting) {
        loadDoneBubbles();
      } else {
        hideDoneBubbles();
      }
      break;
    case 'repelForce':
      physicsParams.REPEL_FORCE = settings.repelForce;
      wakePhysics();
      break;
    case 'maxDistance':
      physicsParams.MAX_DISTANCE = settings.maxDistance;
      wakePhysics();
      break;
    case 'linkDistance':
      physicsParams.LINK_DISTANCE = settings.linkDistance;
      wakePhysics();
      break;
    case 'colorTheme':
      setColorTheme(settings.colorTheme);
      refreshBubbleColors();
      break;
  }
}

export function saveBackup() {
  bubbleRepository.exportBackup().catch((e) => alert('Could not save backup: ' + e.message));
}

export function recallBackup() {
  bubbleRepository.importBackup().then((data) => {
    if (!data) return; // cancelled
    if (!confirm(`This will permanently overwrite your current BubbleMap data with the ${data.length} bubble(s) in this file. This cannot be undone.`)) return;
    return bubbleRepository.replaceAll(data).then(() => location.reload());
  }).catch((e) => alert('That file is not a valid BubbleMap backup.\n' + e.message));
}
