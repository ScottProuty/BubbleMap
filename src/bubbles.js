// Bubble lifecycle: rendering, selection, persistence, creation, dragging, and
// loading bubbles into (or out of) the current view.

import { dom, state, settings, physicsParams } from './state.js';
import { clearEl, hslCss, randomColor, formatDate, positionEl, screenToWorld } from './utils.js';
import { findDropTarget, highlightDropTarget, clearDropHighlight, linkBubbles, rebuildLinksSVG } from './linking.js';
import { wakePhysics, pauseDragPhysics, tick } from './physics.js';
import bubbleRepository from './storage/bubbleRepository.js';

// ---------- Rendering ----------

function renderBubbleContent(bubble) {
  const el = bubble.el;
  clearEl(el);
  el.classList.toggle('selected', !!bubble.selected);
  el.classList.toggle('done', !!bubble.done);

  const displayColor = bubble.done
    ? { h: bubble.color.h, s: bubble.color.s * 0.35, l: bubble.color.l }
    : bubble.color;
  const displayColorCss = hslCss(displayColor);
  el.style.borderColor = displayColorCss;
  el.style.setProperty('--bubble-color', displayColorCss);
  el.style.boxShadow = bubble.selected ? `0 0 18px 5px ${displayColorCss}` : '';

  if (bubble.creating) {
    const input = document.createElement('input');
    input.className = 'bubble-title-input';
    input.placeholder = 'Title...';
    input.value = bubble.title || '';
    el.appendChild(input);
    bubble._titleInput = input;
    setTimeout(() => input.focus(), 0);
    return;
  }

  if (bubble.selected && bubble.done) {
    const titleDisplay = document.createElement('div');
    titleDisplay.className = 'bubble-title-display';
    titleDisplay.textContent = bubble.title;
    el.appendChild(titleDisplay);

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.textContent = 'Created: ' + formatDate(bubble.created);
    el.appendChild(meta);

    const doneMeta = document.createElement('div');
    doneMeta.className = 'bubble-meta';
    doneMeta.textContent = 'Marked done: ' + formatDate(bubble.done);
    el.appendChild(doneMeta);

    const descDisplay = document.createElement('div');
    descDisplay.className = 'bubble-description-readonly';
    descDisplay.textContent = bubble.description || '(no description)';
    el.appendChild(descDisplay);

    const actions = document.createElement('div');
    actions.className = 'bubble-actions';
    const unmarkBtn = document.createElement('button');
    unmarkBtn.className = 'done-btn';
    unmarkBtn.textContent = 'Unmark as Done';
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Delete';
    actions.appendChild(unmarkBtn);
    actions.appendChild(delBtn);
    el.appendChild(actions);

    unmarkBtn.addEventListener('click', (e) => { e.stopPropagation(); unmarkBubbleFromMainView(bubble); });
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteBubble(bubble); });

    [unmarkBtn, delBtn].forEach((elm) =>
      elm.addEventListener('mousedown', (e) => e.stopPropagation())
    );
  } else if (bubble.selected) {
    const titleInput = document.createElement('input');
    titleInput.className = 'bubble-title-input';
    titleInput.value = bubble.title;
    el.appendChild(titleInput);
    bubble._titleInput = titleInput;

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.textContent = 'Created: ' + formatDate(bubble.created);
    el.appendChild(meta);

    const desc = document.createElement('textarea');
    desc.className = 'bubble-description';
    desc.placeholder = 'Description';
    desc.value = bubble.description || '';
    el.appendChild(desc);
    bubble._descInput = desc;

    const actions = document.createElement('div');
    actions.className = 'bubble-actions';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'done-btn';
    doneBtn.textContent = 'Mark as Done';
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Delete';
    actions.appendChild(doneBtn);
    actions.appendChild(delBtn);
    el.appendChild(actions);

    titleInput.addEventListener('blur', () => commitTitle(bubble, titleInput.value));
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); }
    });
    desc.addEventListener('blur', () => commitDescription(bubble, desc.value));
    desc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        deselectBubble(bubble);
      }
    });
    doneBtn.addEventListener('click', (e) => { e.stopPropagation(); markDone(bubble); });
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteBubble(bubble); });

    [titleInput, desc, doneBtn, delBtn].forEach((elm) =>
      elm.addEventListener('mousedown', (e) => e.stopPropagation())
    );
  } else {
    const title = document.createElement('div');
    title.className = 'bubble-title-display';
    title.textContent = bubble.title;
    el.appendChild(title);
  }
}

function createBubbleElement(bubble) {
  const el = document.createElement('div');
  el.className = 'bubble';
  dom.worldEl.appendChild(el);
  bubble.el = el;
  positionEl(bubble);
  renderBubbleContent(bubble);
  el.addEventListener('mousedown', (e) => onBubbleMouseDown(e, bubble));
  el.addEventListener('dblclick', (e) => e.stopPropagation());
}

// ---------- Color theme ----------

// Re-renders every currently displayed bubble (and the links between them) so a
// theme change takes effect immediately, without touching any bubble's stored
// (normalized) color value.
export function refreshBubbleColors() {
  for (const b of state.bubbles.values()) {
    renderBubbleContent(b);
  }
  rebuildLinksSVG();
}

// ---------- Selection ----------

export function selectBubble(bubble) {
  if (state.selectedBubble === bubble) return;
  if (state.selectedBubble) deselectBubble(state.selectedBubble);
  const closedWidth = bubble.el.offsetWidth;
  bubble.selected = true;
  state.selectedBubble = bubble;
  renderBubbleContent(bubble);
  // The expanded layout (title input + description + actions) can end up
  // narrower than the closed title-only layout - never let expanding make the
  // bubble shrink.
  if (bubble.el.offsetWidth < closedWidth) {
    bubble.el.style.minWidth = closedWidth + 'px';
  }
  wakePhysics();
}

export function deselectBubble(bubble) {
  // Flush any pending edits before tearing down the inputs below. Can't rely on
  // the browser having already fired 'blur' on them - Safari, unlike Chrome,
  // doesn't reliably blur a focused element on mousedown when the newly-clicked
  // target (e.g. the canvas) isn't itself focusable.
  if (bubble._titleInput) commitTitle(bubble, bubble._titleInput.value);
  if (bubble._descInput) commitDescription(bubble, bubble._descInput.value);

  bubble.selected = false;
  if (state.selectedBubble === bubble) state.selectedBubble = null;
  bubble.el.style.minWidth = '';
  renderBubbleContent(bubble);
  wakePhysics();
}

// ---------- Persistence ----------

export function persistBubble(bubble) {
  if (!bubble.id) return Promise.resolve(null);
  return bubbleRepository.updateBubble(bubble.id, {
    title: bubble.title,
    description: bubble.description,
    parents: bubble.parents,
    color: bubble.color,
    done: bubble.done
  });
}

function commitTitle(bubble, value) {
  const title = value.trim();
  if (!title || title === bubble.title) {
    if (bubble._titleInput) bubble._titleInput.value = bubble.title;
    return;
  }
  bubble.title = title;
  persistBubble(bubble);
}

function commitDescription(bubble, value) {
  if (value === bubble.description) return;
  bubble.description = value;
  persistBubble(bubble);
}

function markDone(bubble) {
  bubble.done = new Date().toISOString();
  persistBubble(bubble).then(() => {
    if (settings.showCompletedSetting) {
      deselectBubble(bubble);
      wakePhysics();
    } else {
      removeBubbleFromMainView(bubble);
    }
  });
}

export function setDoneState(id, doneValue) {
  return bubbleRepository.updateBubble(id, { done: doneValue });
}

function unmarkBubbleFromMainView(bubble) {
  setDoneState(bubble.id, '').then((updated) => {
    addExistingBubbleToMainView(updated);
  });
}

function deleteBubble(bubble) {
  bubbleRepository.deleteBubble(bubble.id).then(() => {
    for (const b of state.bubbles.values()) {
      const idx = b.parents.indexOf(bubble.id);
      if (idx !== -1) b.parents.splice(idx, 1);
    }
    removeBubbleFromMainView(bubble);
  });
}

function removeBubbleFromMainView(bubble) {
  if (state.selectedBubble === bubble) state.selectedBubble = null;
  bubble.el.remove();
  state.bubbles.delete(bubble.id);
  wakePhysics();
}

// ---------- Bubble creation ----------

export function startCreateBubble(x, y) {
  if (state.creatingBubble) cancelCreating();
  if (state.selectedBubble) deselectBubble(state.selectedBubble);

  const bubble = {
    id: null,
    creating: true,
    title: '',
    description: '',
    created: '',
    done: '',
    parents: [],
    color: randomColor(),
    x, y, vx: 0, vy: 0,
    selected: false
  };

  const el = document.createElement('div');
  el.className = 'bubble';
  dom.worldEl.appendChild(el);
  bubble.el = el;
  positionEl(bubble);
  renderBubbleContent(bubble);

  state.creatingBubble = bubble;
  const input = bubble._titleInput;

  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finalizeCreate(bubble, input.value, false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finalizeCreate(bubble, input.value, true);
    } else if (e.key === 'Escape') {
      cancelCreating();
    }
  });

  const outsideHandler = (e) => {
    if (bubble.el.contains(e.target)) return;
    if (input.value.trim()) {
      finalizeCreate(bubble, input.value, false);
    } else {
      cancelCreating();
    }
  };
  bubble._outsideHandler = outsideHandler;
  document.addEventListener('mousedown', outsideHandler, true);
}

function cancelCreating() {
  if (!state.creatingBubble) return;
  const bubble = state.creatingBubble;
  document.removeEventListener('mousedown', bubble._outsideHandler, true);
  bubble.el.remove();
  state.creatingBubble = null;
}

function finalizeCreate(bubble, titleValue, expandAfter) {
  const title = titleValue.trim();
  if (!title) {
    cancelCreating();
    return;
  }
  document.removeEventListener('mousedown', bubble._outsideHandler, true);
  state.creatingBubble = null;

  bubbleRepository.createBubble({ title, color: bubble.color, parents: [] }).then((data) => {
    bubble.id = data.id;
    bubble.title = data.title;
    bubble.created = data.created;
    bubble.done = data.done;
    bubble.parents = data.parents;
    bubble.description = data.description;
    bubble.creating = false;

    state.bubbles.set(bubble.id, bubble);
    bubble.el.addEventListener('mousedown', (e) => onBubbleMouseDown(e, bubble));
    bubble.el.addEventListener('dblclick', (e) => e.stopPropagation());
    wakePhysics();

    if (expandAfter) {
      selectBubble(bubble);
      if (bubble._descInput) setTimeout(() => bubble._descInput.focus(), 0);
    } else {
      renderBubbleContent(bubble);
    }
  });
}

// ---------- Dragging ----------

function onBubbleMouseDown(e, bubble) {
  if (e.button !== 0) return;
  if (bubble.creating) return;
  e.stopPropagation();

  const startScreen = { x: e.clientX, y: e.clientY };
  const startWorld = { x: bubble.x, y: bubble.y };
  let dragStarted = false;
  const threshold = 5;

  function onMove(ev) {
    const dxScreen = ev.clientX - startScreen.x;
    const dyScreen = ev.clientY - startScreen.y;
    if (!dragStarted && Math.hypot(dxScreen, dyScreen) > threshold) {
      dragStarted = true;
      state.draggingBubble = bubble;
      bubble.el.classList.add('dragging');
      wakePhysics();
    }
    if (dragStarted) {
      bubble.x = startWorld.x + dxScreen / state.zoom;
      bubble.y = startWorld.y + dyScreen / state.zoom;
      positionEl(bubble);
      rebuildLinksSVG();
      const target = findDropTarget(bubble);
      highlightDropTarget(bubble, target);
      if (target) {
        pauseDragPhysics();
      } else {
        wakePhysics();
      }
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (dragStarted) {
      bubble.el.classList.remove('dragging');
      state.draggingBubble = null;
      const target = findDropTarget(bubble);
      clearDropHighlight();
      if (target) linkBubbles(bubble, target);
      rebuildLinksSVG();
      wakePhysics();
    } else {
      selectBubble(bubble);
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ---------- Loading bubbles into view ----------

function defaultPositionForNewBubble(data, above) {
  const parentObjs = (data.parents || []).map((pid) => state.bubbles.get(pid)).filter(Boolean);
  const offset = above ? -physicsParams.LINK_DISTANCE : physicsParams.LINK_DISTANCE;
  if (parentObjs.length) {
    const avgX = parentObjs.reduce((s, p) => s + p.x, 0) / parentObjs.length;
    const avgY = parentObjs.reduce((s, p) => s + p.y, 0) / parentObjs.length;
    return { x: avgX + (Math.random() - 0.5) * 60, y: avgY + offset };
  }
  return screenToWorld(window.innerWidth / 2 + (Math.random() - 0.5) * 100, window.innerHeight / 2 + (Math.random() - 0.5) * 100);
}

export function addExistingBubbleToMainView(data) {
  const existing = state.bubbles.get(data.id);
  if (existing) {
    existing.title = data.title;
    existing.created = data.created;
    existing.done = data.done;
    existing.parents = data.parents;
    existing.color = data.color;
    existing.description = data.description;
    existing.selected = false;
    if (state.selectedBubble === existing) state.selectedBubble = null;
    renderBubbleContent(existing);
    wakePhysics();
    return;
  }

  const pos = defaultPositionForNewBubble(data);
  const bubble = {
    id: data.id,
    title: data.title,
    created: data.created,
    done: data.done,
    parents: data.parents,
    color: data.color,
    description: data.description,
    x: pos.x, y: pos.y, vx: 0, vy: 0,
    selected: false,
    creating: false
  };
  createBubbleElement(bubble);
  state.bubbles.set(bubble.id, bubble);
  wakePhysics();
}

// ---------- Show Completed ----------

export function loadDoneBubbles() {
  bubbleRepository.listBubbles().then((list) => {
    const doneItems = list.filter((b) => b.done && !state.bubbles.has(b.id));
    doneItems.forEach((data) => {
      const pos = defaultPositionForNewBubble(data, true);
      const bubble = {
        id: data.id,
        title: data.title,
        created: data.created,
        done: data.done,
        parents: data.parents,
        color: data.color,
        description: data.description,
        x: pos.x, y: pos.y, vx: 0, vy: 0,
        selected: false,
        creating: false
      };
      createBubbleElement(bubble);
      state.bubbles.set(bubble.id, bubble);
    });
    wakePhysics();
  });
}

export function hideDoneBubbles() {
  for (const b of Array.from(state.bubbles.values())) {
    if (!b.done) continue;
    if (state.selectedBubble === b) state.selectedBubble = null;
    b.el.remove();
    state.bubbles.delete(b.id);
  }
  rebuildLinksSVG();
}

// ---------- Initial layout ----------

function layoutInitialPositions(list) {
  const byId = new Map(list.map((b) => [b.id, b]));
  const positioned = new Set();
  const roots = list.filter((b) => !b.parents.some((pid) => byId.has(pid)));

  roots.forEach((b, i) => {
    b._x = (i - (roots.length - 1) / 2) * 260;
    b._y = 0;
    positioned.add(b.id);
  });

  let frontier = roots.slice();
  let guard = 0;
  while (frontier.length && guard++ < 1000) {
    const next = [];
    for (const b of frontier) {
      const children = list.filter((c) => c.parents.includes(b.id) && !positioned.has(c.id));
      children.forEach((c, i) => {
        if (positioned.has(c.id)) return;
        const parentXs = c.parents.map((pid) => byId.get(pid)).filter((p) => p && positioned.has(p.id)).map((p) => p._x);
        c._x = (parentXs.length ? parentXs.reduce((s, v) => s + v, 0) / parentXs.length : b._x) + (i - (children.length - 1) / 2) * 180;
        c._y = b._y + physicsParams.LINK_DISTANCE;
        positioned.add(c.id);
        next.push(c);
      });
    }
    frontier = next;
  }

  list.forEach((b) => {
    if (!positioned.has(b.id)) {
      b._x = (Math.random() - 0.5) * 600;
      b._y = (Math.random() - 0.5) * 600;
    }
  });
}

export function loadBubbles() {
  bubbleRepository.listBubbles().then((list) => {
    const active = list.filter((b) => !b.done);
    layoutInitialPositions(active);
    active.forEach((data) => {
      const bubble = {
        id: data.id,
        title: data.title,
        created: data.created,
        done: data.done,
        parents: data.parents,
        color: data.color,
        description: data.description,
        x: data._x, y: data._y, vx: 0, vy: 0,
        selected: false,
        creating: false
      };
      createBubbleElement(bubble);
      state.bubbles.set(bubble.id, bubble);
    });
    rebuildLinksSVG();
    requestAnimationFrame(tick);
  }).catch((err) => alert('Failed to load BubbleMap data: ' + err.message));
}
