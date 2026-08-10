// Small, mostly-pure helpers shared across modules.

import { dom, state } from './state.js';

// Each bubble stores its color as normalized h/s/l values in [0, 1] rather than
// real HSL numbers - see randomColor() below. hslCss() scales those normalized
// values into the currently selected theme's ranges, so switching themes just
// changes the scaling, never the underlying stored value. That's what lets a
// bubble return to its exact previous look when the user switches back.
export const colorThemes = {
  'Rainbow': {
    hueRange: [0, 360],
    saturationRange: [70, 90],
    lightnessRange: [45, 70]
  },
  'Pastel': {
    hueRange: [0, 360],
    saturationRange: [40, 60],
    lightnessRange: [70, 90]
  },
  'Mono Blue': {
    hueRange: [210, 270],
    saturationRange: [60, 100],
    lightnessRange: [50, 70]
  },
  'Sunset': {
    hueRange: [0, 60],
    saturationRange: [70, 90],
    lightnessRange: [40, 60]
  },
  'Muted': {
    hueRange: [0, 360],
    saturationRange: [30, 50],
    lightnessRange: [55, 70]
  },
  'Vibrant': {
    hueRange: [0, 360],
    saturationRange: [80, 100],
    lightnessRange: [50, 65]
  },
};

const DEFAULT_COLOR_THEME = 'Rainbow';
let currentTheme = DEFAULT_COLOR_THEME;

export function colorThemeNames() {
  return Object.keys(colorThemes);
}

export function getColorTheme() {
  return currentTheme;
}

export function setColorTheme(name) {
  if (colorThemes[name]) currentTheme = name;
}

function scaleToRange(t, [min, max]) {
  return min + t * (max - min);
}

export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function hslCss(color) {
  const theme = colorThemes[currentTheme];
  const h = scaleToRange(color.h, theme.hueRange);
  const s = scaleToRange(color.s, theme.saturationRange);
  const l = scaleToRange(color.l, theme.lightnessRange);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Normalized h/s/l in [0, 1] - see the comment above colorThemes.
export function randomColor() {
  return { h: Math.random(), s: Math.random(), l: Math.random() };
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function applyTransform() {
  const t = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  dom.worldEl.style.transform = t;
  dom.linksLayerEl.style.transform = t;
}

export function screenToWorld(sx, sy) {
  return { x: (sx - state.pan.x) / state.zoom, y: (sy - state.pan.y) / state.zoom };
}

export function positionEl(bubble) {
  bubble.el.style.left = bubble.x + 'px';
  bubble.el.style.top = bubble.y + 'px';
}

export function bubbleRadius(bubble) {
  const w = (bubble.el.offsetWidth || 140) / state.zoom;
  const h = (bubble.el.offsetHeight || 50) / state.zoom;
  return Math.hypot(w, h) / 2;
}
