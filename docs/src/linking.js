// Parent/child linking, the color-inheritance that flows from it, and rendering
// the SVG link lines (including hover state and the unlink "x" button).

import { dom, state } from './state.js';
import { hslCss, distanceToSegment, randomColor } from './utils.js';
import { persistBubbleColors } from './bubbles.js';
import { wakePhysics } from './physics.js';

const CHILD_HUE_JITTER = 10 / 360; // Fraction of the full hue range a single-parent child's hue is shifted from its parent's
const OVERLAP_THRESHOLD = 110; // Distance between dragged and target bubble to allow drop for linkage
const LINK_HOVER_THRESHOLD = 10;

const SVG_NS = 'http://www.w3.org/2000/svg';

function hasAncestor(bubble, targetId, visited) {
  visited = visited || new Set();
  for (const pid of bubble.parents) {
    if (pid === targetId) return true;
    if (visited.has(pid)) continue;
    visited.add(pid);
    const p = state.bubbles.get(pid);
    if (p && hasAncestor(p, targetId, visited)) return true;
  }
  return false;
}

// Circular mean of normalized hues (each in [0, 1), representing a fraction of
// the full hue wheel) so e.g. averaging 0.99 and 0.02 gives ~0.005, not ~0.5.
function averageHue(hues) {
  let sx = 0, sy = 0;
  hues.forEach((h) => {
    const rad = h * 2 * Math.PI;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  });
  let avg = Math.atan2(sy / hues.length, sx / hues.length) / (2 * Math.PI);
  if (avg < 0) avg += 1;
  return avg;
}

// Climbs the single-parent chain starting at `parent` until it reaches an
// ancestor with no parents or with more than one parent (a split), which is
// the node whose ID decides a single-parent child's hue direction.
function findHueDirectionSource(parent) {
  let current = parent;
  const visited = new Set();
  while (current.parents.length === 1 && !visited.has(current.id)) {
    visited.add(current.id);
    const next = state.bubbles.get(current.parents[0]);
    if (!next) break;
    current = next;
  }
  return current;
}

// First hex digit 0-7 drifts hue down, 8-F drifts it up, so unrelated chains
// spread apart instead of drifting the same direction.
function hueDirectionFromId(id) {
  return '01234567'.includes(id[0].toLowerCase()) ? -1 : 1;
}

function computeColorFromParents(bubble) {
  if (!bubble.parents.length) return randomColor();
  const parentColors = bubble.parents.map((pid) => state.bubbles.get(pid)).filter(Boolean).map((p) => p.color);
  if (!parentColors.length) return bubble.color;
  const avgH = averageHue(parentColors.map((c) => c.h));
  const avgS = parentColors.reduce((s, c) => s + c.s, 0) / parentColors.length;
  const avgL = parentColors.reduce((s, c) => s + c.l, 0) / parentColors.length;

  let finalHue = avgH;
  if (bubble.parents.length === 1) {
    const parent = state.bubbles.get(bubble.parents[0]);
    const direction = parent ? hueDirectionFromId(findHueDirectionSource(parent).id) : 1;
    finalHue = ((avgH + direction * CHILD_HUE_JITTER) % 1 + 1) % 1;
  }

  return { h: finalHue, s: avgS, l: Math.min(1, avgL + 0.1) };
}

// Walks the recolored bubble's descendants in memory, collecting every
// {id, color} change into `changed` instead of persisting at each level, so
// the caller can write them all back in a single batched round trip - several
// concurrent per-bubble persistBubble() calls here used to race the same
// load/mutate/save cycle that deleteBubbles() was fixed for.
function recomputeColorsFrom(bubble, changed) {
  bubble.color = computeColorFromParents(bubble);
  const colorCss = hslCss(bubble.color);
  bubble.el.style.borderColor = colorCss;
  bubble.el.style.setProperty('--bubble-color', colorCss);
  if (bubble.selected) bubble.el.style.boxShadow = `0 0 18px 5px ${colorCss}`;
  changed.push(bubble);
  for (const b of state.bubbles.values()) {
    if (b.parents.includes(bubble.id)) recomputeColorsFrom(b, changed);
  }
}

export function unlinkBubbles(child, parent) {
  const idx = child.parents.indexOf(parent.id);
  if (idx === -1) return;
  child.parents.splice(idx, 1);
  const changed = [];
  recomputeColorsFrom(child, changed);
  persistBubbleColors(changed);
  rebuildLinksSVG();
  wakePhysics();
}

export function linkBubbles(child, parent) {
  if (child === parent || !parent.id || !child.id) return;
  if (child.parents.includes(parent.id)) return;
  if (hasAncestor(parent, child.id)) return;
  child.parents.push(parent.id);
  const changed = [];
  recomputeColorsFrom(child, changed);
  persistBubbleColors(changed);
  wakePhysics();
}

export function findDropTarget(bubble) {
  let best = null;
  let bestDist = Infinity;
  for (const o of state.bubbles.values()) {
    if (o === bubble) continue;
    const d = Math.hypot(o.x - bubble.x, o.y - bubble.y);
    if (d < OVERLAP_THRESHOLD && d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return best;
}

export function highlightDropTarget(bubble, target) {
  for (const o of state.bubbles.values()) {
    if (o === bubble) continue;
    o.el.style.outline = target === o ? `3px dashed ${hslCss(o.color)}` : '';
  }
}

export function clearDropHighlight() {
  for (const o of state.bubbles.values()) o.el.style.outline = '';
}

function linkKey(childId, parentId) {
  return childId + '::' + parentId;
}

export function updateLinkHover() {
  let closestKey = null;
  let closestDist = LINK_HOVER_THRESHOLD;
  if (state.mouseScreen) {
    for (const b of state.bubbles.values()) {
      for (const pid of b.parents) {
        const p = state.bubbles.get(pid);
        if (!p) continue;
        const x1 = p.x * state.zoom + state.pan.x, y1 = p.y * state.zoom + state.pan.y;
        const x2 = b.x * state.zoom + state.pan.x, y2 = b.y * state.zoom + state.pan.y;
        const d = distanceToSegment(state.mouseScreen.x, state.mouseScreen.y, x1, y1, x2, y2);
        if (d < closestDist) {
          closestDist = d;
          closestKey = linkKey(b.id, pid);
        }
      }
    }
  }
  if (closestKey !== state.hoveredLinkKey) {
    state.hoveredLinkKey = closestKey;
    rebuildLinksSVG();
  }
}

// Cache of linkKey -> live SVG elements for that link, so rebuildLinksSVG()
// (called on every physics frame to track moving bubbles) can update
// coordinates on existing elements instead of tearing down and recreating the
// full SVG subtree every frame. Entries persist across calls; only added to
// or removed from when the link set itself actually changes.
const linkElements = new Map();

function createLinkElement(child, parent) {
  const entry = { child, parent };

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'link-group');

  const visible = document.createElementNS(SVG_NS, 'line');
  visible.setAttribute('class', 'link-visible');

  const xGroup = document.createElementNS(SVG_NS, 'g');
  xGroup.setAttribute('class', 'link-x');

  const xBg = document.createElementNS(SVG_NS, 'circle');
  xBg.setAttribute('r', '9');
  xBg.setAttribute('class', 'link-x-bg');

  const xLabel = document.createElementNS(SVG_NS, 'text');
  xLabel.setAttribute('class', 'link-x-label');
  xLabel.setAttribute('x', '0');
  xLabel.setAttribute('y', '1');
  xLabel.textContent = '×';

  xGroup.appendChild(xBg);
  xGroup.appendChild(xLabel);
  xGroup.addEventListener('mousedown', (e) => e.stopPropagation());
  xGroup.addEventListener('click', (e) => {
    e.stopPropagation();
    unlinkBubbles(entry.child, entry.parent);
  });

  g.appendChild(visible);
  g.appendChild(xGroup);

  entry.g = g;
  entry.visible = visible;
  entry.xGroup = xGroup;
  return entry;
}

function updateLinkElement(entry, child, parent, isHovered) {
  entry.child = child;
  entry.parent = parent;
  entry.g.setAttribute('class', 'link-group' + (isHovered ? ' active' : ''));
  entry.g.style.setProperty('--link-color', hslCss(parent.color));
  entry.visible.setAttribute('x1', parent.x);
  entry.visible.setAttribute('y1', parent.y);
  entry.visible.setAttribute('x2', child.x);
  entry.visible.setAttribute('y2', child.y);
  entry.xGroup.setAttribute('transform', `translate(${(parent.x + child.x) / 2}, ${(parent.y + child.y) / 2})`);
}

export function rebuildLinksSVG() {
  const desiredKeys = new Set();
  for (const b of state.bubbles.values()) {
    for (const pid of b.parents) {
      const p = state.bubbles.get(pid);
      if (!p) continue;

      const key = linkKey(b.id, pid);
      desiredKeys.add(key);
      let entry = linkElements.get(key);
      if (!entry) {
        entry = createLinkElement(b, p);
        linkElements.set(key, entry);
        dom.linksLayerEl.appendChild(entry.g);
      }
      updateLinkElement(entry, b, p, state.hoveredLinkKey === key);
    }
  }
  for (const [key, entry] of linkElements) {
    if (desiredKeys.has(key)) continue;
    entry.g.remove();
    linkElements.delete(key);
  }
}
