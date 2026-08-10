// Shared mutable state for the app, plus the DOM element references every other
// module wires up against. Kept as plain objects (rather than individual `let`
// exports) so other modules can mutate fields in place - ES modules only allow
// live *bindings* to be read across files, not reassigned, so a mutable shared
// value has to live on an object.

export const dom = {
  canvasEl: document.getElementById('canvas'),
  worldEl: document.getElementById('world'),
  linksLayerEl: document.getElementById('linksLayer'),
  addBubbleBtn: document.getElementById('addBubbleBtn'),
  doneListBtn: document.getElementById('doneListBtn'),
  doneListOverlay: document.getElementById('doneListOverlay'),
  doneListItemsEl: document.getElementById('doneListItems'),
  doneListCloseBtn: document.getElementById('doneListCloseBtn'),
  settingsBtn: document.getElementById('SettingsBtn'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  saveBackupBtn: document.getElementById('saveBackupBtn'),
  recallBackupBtn: document.getElementById('recallBackupBtn')
};

// Physics knobs that are user-adjustable from the Settings modal - see
// src/settings.js. Kept separate from the rest of `state` since they're
// conceptually config rather than runtime/interaction state.
export const physicsParams = {
  REPEL_FORCE: 180, // Distance each bubble would like to be away from every other bubble
  MAX_DISTANCE: 420, // Max distance between each bubble and the next closest bubble
  LINK_DISTANCE: 140 // Distance a child bubble would like to be away from its parent
};

export const state = {
  bubbles: new Map(),
  selectedBubble: null,
  creatingBubble: null,
  draggingBubble: null,

  pan: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  zoom: 1,
  isPanning: false,
  panStartScreen: null,
  panStartPan: null,

  // Hover state for links, tracked here (rather than via CSS :hover) because
  // rebuildLinksSVG can recreate link elements every physics frame while bubbles
  // are still settling - a freshly recreated element wouldn't reliably inherit
  // native :hover state without a fresh pointer event.
  mouseScreen: null,
  hoveredLinkKey: null,

  // Physics scheduler state - see src/physics.js.
  quietFrames: 0,
  physicsAsleep: false,
  physicsPaused: false,
  lastTime: null
};

// On the web deployment, these are persisted to localStorage (and reloaded into
// this object) by src/settings.js - see loadPersistedSettings()/persistSettings()
// there. The values below are just the in-memory defaults used until that load
// happens, and the fallback if nothing's been saved yet.
export const settings = {
  showCompletedSetting: false,
  repelForce: physicsParams.REPEL_FORCE,
  maxDistance: physicsParams.MAX_DISTANCE,
  linkDistance: physicsParams.LINK_DISTANCE,
  colorTheme: 'Rainbow'
};
