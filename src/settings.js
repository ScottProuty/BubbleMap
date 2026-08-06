// The Settings modal (physics tuning + show-completed toggle) and backup save/recall.
//
// FRAMEWORK - to add a new setting:
//   1. In index.html, add a ".settings-row" inside #settingsBody with a label and
//      an input/select/checkbox for the setting (see the example comment there).
//   2. Add a key + default value for it to the `settings` object in src/state.js.
//   3. In `bindSettingsControls()`, look up the control by id and sync its value from
//      `settings.<key>` (this part runs every time the modal opens). Then, inside the
//      `if (settingsControlsBound) return;` guard, add a change/input listener that
//      updates `settings.<key>` and calls `applySetting('<key>')`. The guard ensures the
//      listener is only attached once, no matter how many times the modal is reopened.
//   4. In `applySetting()`, add a case for `<key>` that makes the setting take effect.

import { dom, settings, physicsParams } from './state.js';
import { wakePhysics } from './physics.js';
import { loadDoneBubbles, hideDoneBubbles } from './bubbles.js';
import bubbleRepository from './storage/bubbleRepository.js';

export function openSettings() {
  bindSettingsControls();
  dom.settingsOverlay.classList.remove('hidden');
}

export function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
}

// True once the settings controls' change/input listeners have been attached. Only the
// value-syncing should happen on every open; listeners are attached a single time.
let settingsControlsBound = false;

// Syncs each settings control to the current value in `settings`, and (the first time
// only) attaches its change listener. Called every time the modal opens.
function bindSettingsControls() {
  const showCompletedInput = document.getElementById('showCompletedSetting');
  const repelForceInput = document.getElementById('repelForceSetting');
  const maxDistanceInput = document.getElementById('maxDistanceSetting');
  const linkDistanceInput = document.getElementById('linkDistanceSetting');

  showCompletedInput.checked = settings.showCompletedSetting;
  repelForceInput.value = settings.repelForce;
  maxDistanceInput.value = settings.maxDistance;
  linkDistanceInput.value = settings.linkDistance;

  if (settingsControlsBound) return;
  settingsControlsBound = true;

  showCompletedInput.addEventListener('change', () => {
    settings.showCompletedSetting = showCompletedInput.checked;
    applySetting('showCompletedSetting');
  });

  repelForceInput.addEventListener('input', () => {
    const val = parseFloat(repelForceInput.value);
    if (!Number.isFinite(val)) return;
    settings.repelForce = val;
    applySetting('repelForce');
  });

  maxDistanceInput.addEventListener('input', () => {
    const val = parseFloat(maxDistanceInput.value);
    if (!Number.isFinite(val)) return;
    settings.maxDistance = val;
    applySetting('maxDistance');
  });

  linkDistanceInput.addEventListener('input', () => {
    const val = parseFloat(linkDistanceInput.value);
    if (!Number.isFinite(val)) return;
    settings.linkDistance = val;
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
