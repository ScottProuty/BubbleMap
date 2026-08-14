// Entry point: wires up canvas pan/zoom/creation and toolbar interactions, then
// boots the app. The actual feature logic lives in the sibling modules.

import { dom, state } from './state.js';
import { applyTransform, screenToWorld } from './utils.js';
import { startCreateBubble, deselectBubble, loadBubbles } from './bubbles.js';
import { updateLinkHover } from './linking.js';
import { openDoneList, closeDoneList } from './doneList.js';
import { openSettings, closeSettings, saveBackup, recallBackup } from './settings.js';
import { startBoxSelect, resetSelection, deleteAllSelected, toggleDoneAllSelected } from './selection.js';

// ---------- Canvas pan / zoom / creation ----------

dom.canvasEl.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    e.preventDefault();
    if (state.selectedBubble) deselectBubble(state.selectedBubble);
    state.isPanning = true;
    dom.canvasEl.classList.add('panning');
    state.panStartScreen = { x: e.clientX, y: e.clientY };
    state.panStartPan = { x: state.pan.x, y: state.pan.y };
    return;
  }
  if (e.button !== 0) return;
  if (state.selectedBubble) deselectBubble(state.selectedBubble);
  startBoxSelect(e);
});

document.addEventListener('mousemove', (e) => {
  if (!state.isPanning) return;
  state.pan.x = state.panStartPan.x + (e.clientX - state.panStartScreen.x);
  state.pan.y = state.panStartPan.y + (e.clientY - state.panStartScreen.y);
  applyTransform();
  updateLinkHover();
});

document.addEventListener('mouseup', () => {
  state.isPanning = false;
  dom.canvasEl.classList.remove('panning');
});

dom.canvasEl.addEventListener('mousemove', (e) => {
  state.mouseScreen = { x: e.clientX, y: e.clientY };
  updateLinkHover();
});

dom.canvasEl.addEventListener('mouseleave', () => {
  state.mouseScreen = null;
  updateLinkHover();
});

dom.canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = dom.canvasEl.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const worldPt = screenToWorld(mx, my);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  state.zoom = Math.min(3, Math.max(0.2, state.zoom * factor));
  state.pan.x = mx - worldPt.x * state.zoom;
  state.pan.y = my - worldPt.y * state.zoom;
  applyTransform();
  updateLinkHover();
}, { passive: false });

dom.canvasEl.addEventListener('dblclick', (e) => {
  if (e.target !== dom.canvasEl && e.target !== dom.worldEl) return;
  const rect = dom.canvasEl.getBoundingClientRect();
  const worldPt = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  startCreateBubble(worldPt.x, worldPt.y);
});

dom.addBubbleBtn.addEventListener('click', () => {
  resetSelection();
  const worldPt = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  startCreateBubble(worldPt.x, worldPt.y);
});

dom.selectionDeleteAllBtn.addEventListener('click', deleteAllSelected);
dom.selectionMarkDoneBtn.addEventListener('click', toggleDoneAllSelected);

document.addEventListener('keydown', (e) => {
  if (!state.selectedBubbles.size) return;
  if (e.key === 'Escape') {
    resetSelection();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    deleteAllSelected();
  }
});

dom.doneListBtn.addEventListener('click', openDoneList);
dom.doneListCloseBtn.addEventListener('click', closeDoneList);
dom.doneListOverlay.addEventListener('mousedown', (e) => {
  if (e.target === dom.doneListOverlay) closeDoneList();
});

dom.settingsBtn.addEventListener('click', openSettings);
dom.settingsCloseBtn.addEventListener('click', closeSettings);
dom.settingsOverlay.addEventListener('mousedown', (e) => {
  if (e.target === dom.settingsOverlay) closeSettings();
});
dom.saveBackupBtn.addEventListener('click', saveBackup);
dom.recallBackupBtn.addEventListener('click', recallBackup);

applyTransform();
loadBubbles();
