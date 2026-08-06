// Small, mostly-pure helpers shared across modules.

import { dom, state } from './state.js';

export function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function hslCss(color) {
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

export function randomColor() {
  return {
    h: Math.floor(Math.random() * 360),
    s: 60 + Math.floor(Math.random() * 25),
    l: 45 + Math.floor(Math.random() * 15)
  };
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
