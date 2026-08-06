import bubbleRepository from './src/storage/bubbleRepository.js';

(function () {
  'use strict';

  // Physics constants
  // REPEL_FORCE, MAX_DISTANCE and LINK_DISTANCE are `let` (not `const`) because they are
  // user-adjustable from the Settings modal - see the "Settings" section below.
  let REPEL_FORCE = 180; // Distance each bubble would like to be away from every other bubble
  let MAX_DISTANCE = 420; // Max distance between each bubble and the next closest bubble
  let LINK_DISTANCE = 140; // Distance a child bubble would like to be away from its parent
  const LINK_SPRING = 0.02; // Strength of the pull keeping linked bubbles at LINK_DISTANCE
  const LINK_DOWN_BIAS = 0.3; // Gentle nudge that makes children prefer settling below their parent
  const INTERSECT_PUSH = 6; // Repelling force when two bubbles intersect
  const MASS_PER_CHILD = 1; // Extra resistance to movement added per child a bubble has
  const CHILD_HUE_JITTER = 10; // Random +/- degrees a child's hue may drift from its parent's
  const OVERLAP_THRESHOLD = 110; // Distance between dragged and target bubble to allow drop for linkage

  const canvasEl = document.getElementById('canvas');
  const worldEl = document.getElementById('world');
  const linksLayerEl = document.getElementById('linksLayer');
  const addBubbleBtn = document.getElementById('addBubbleBtn');
  const doneListBtn = document.getElementById('doneListBtn');
  const doneListOverlay = document.getElementById('doneListOverlay');
  const doneListItemsEl = document.getElementById('doneListItems');
  const doneListCloseBtn = document.getElementById('doneListCloseBtn');
  const settingsBtn = document.getElementById('SettingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const saveBackupBtn = document.getElementById('saveBackupBtn');
  const recallBackupBtn = document.getElementById('recallBackupBtn');

  const bubbles = new Map();
  let selectedBubble = null;
  let creatingBubble = null;
  let draggingBubble = null;

  let pan = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let zoom = 1;
  let isPanning = false;
  let panStartScreen = null;
  let panStartPan = null;

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function hslCss(color) {
    return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
  }

  function randomColor() {
    return {
      h: Math.floor(Math.random() * 360),
      s: 60 + Math.floor(Math.random() * 25),
      l: 45 + Math.floor(Math.random() * 15)
    };
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function applyTransform() {
    const t = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    worldEl.style.transform = t;
    linksLayerEl.style.transform = t;
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  function positionEl(bubble) {
    bubble.el.style.left = bubble.x + 'px';
    bubble.el.style.top = bubble.y + 'px';
  }

  function bubbleRadius(bubble) {
    const w = (bubble.el.offsetWidth || 140) / zoom;
    const h = (bubble.el.offsetHeight || 50) / zoom;
    return Math.hypot(w, h) / 2;
  }

  // ---------- Rendering ----------

  function renderBubbleContent(bubble) {
    const el = bubble.el;
    clearEl(el);
    el.classList.toggle('selected', !!bubble.selected);
    el.classList.toggle('done', !!bubble.done);

    const displayColor = bubble.done
      ? { h: bubble.color.h, s: Math.round(bubble.color.s * 0.35), l: bubble.color.l }
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
    worldEl.appendChild(el);
    bubble.el = el;
    positionEl(bubble);
    renderBubbleContent(bubble);
    el.addEventListener('mousedown', (e) => onBubbleMouseDown(e, bubble));
    el.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // ---------- Selection ----------

  function selectBubble(bubble) {
    if (selectedBubble === bubble) return;
    if (selectedBubble) deselectBubble(selectedBubble);
    bubble.selected = true;
    selectedBubble = bubble;
    renderBubbleContent(bubble);
    wakePhysics();
  }

  function deselectBubble(bubble) {
    bubble.selected = false;
    if (selectedBubble === bubble) selectedBubble = null;
    renderBubbleContent(bubble);
    wakePhysics();
  }

  // ---------- Persistence ----------

  function persistBubble(bubble) {
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

  function setDoneState(id, doneValue) {
    return bubbleRepository.updateBubble(id, { done: doneValue });
  }

  function unmarkBubbleFromMainView(bubble) {
    setDoneState(bubble.id, '').then((updated) => {
      addExistingBubbleToMainView(updated);
    });
  }

  function deleteBubble(bubble) {
    bubbleRepository.deleteBubble(bubble.id).then(() => {
      for (const b of bubbles.values()) {
        const idx = b.parents.indexOf(bubble.id);
        if (idx !== -1) b.parents.splice(idx, 1);
      }
      removeBubbleFromMainView(bubble);
    });
  }

  function removeBubbleFromMainView(bubble) {
    if (selectedBubble === bubble) selectedBubble = null;
    bubble.el.remove();
    bubbles.delete(bubble.id);
    wakePhysics();
  }

  // ---------- Linking & color inheritance ----------

  function hasAncestor(bubble, targetId, visited) {
    visited = visited || new Set();
    for (const pid of bubble.parents) {
      if (pid === targetId) return true;
      if (visited.has(pid)) continue;
      visited.add(pid);
      const p = bubbles.get(pid);
      if (p && hasAncestor(p, targetId, visited)) return true;
    }
    return false;
  }

  function averageHue(hues) {
    let sx = 0, sy = 0;
    hues.forEach((h) => {
      const rad = (h * Math.PI) / 180;
      sx += Math.cos(rad);
      sy += Math.sin(rad);
    });
    let avg = (Math.atan2(sy / hues.length, sx / hues.length) * 180) / Math.PI;
    if (avg < 0) avg += 360;
    return avg;
  }

  function computeColorFromParents(bubble) {
    if (!bubble.parents.length) return randomColor();
    const parentColors = bubble.parents.map((pid) => bubbles.get(pid)).filter(Boolean).map((p) => p.color);
    if (!parentColors.length) return bubble.color;
    const avgH = averageHue(parentColors.map((c) => c.h));
    const avgS = parentColors.reduce((s, c) => s + c.s, 0) / parentColors.length;
    const avgL = parentColors.reduce((s, c) => s + c.l, 0) / parentColors.length;
    const plusOrMinus = Math.random() < 0.5 ? -1 : 1;
    const hueJitter = plusOrMinus * CHILD_HUE_JITTER;
    const jitteredHue = ((avgH + hueJitter) % 360 + 360) % 360;
    return { h: Math.round(jitteredHue), s: Math.round(avgS), l: Math.min(100, Math.round(avgL + 10)) };
  }

  function recomputeColorsFrom(bubble) {
    bubble.color = computeColorFromParents(bubble);
    const colorCss = hslCss(bubble.color);
    bubble.el.style.borderColor = colorCss;
    bubble.el.style.setProperty('--bubble-color', colorCss);
    if (bubble.selected) bubble.el.style.boxShadow = `0 0 18px 5px ${colorCss}`;
    persistBubble(bubble);
    for (const b of bubbles.values()) {
      if (b.parents.includes(bubble.id)) recomputeColorsFrom(b);
    }
  }

  function unlinkBubbles(child, parent) {
    const idx = child.parents.indexOf(parent.id);
    if (idx === -1) return;
    child.parents.splice(idx, 1);
    recomputeColorsFrom(child);
    rebuildLinksSVG();
    wakePhysics();
  }

  function linkBubbles(child, parent) {
    if (child === parent || !parent.id || !child.id) return;
    if (child.parents.includes(parent.id)) return;
    if (hasAncestor(parent, child.id)) return;
    child.parents.push(parent.id);
    recomputeColorsFrom(child);
    wakePhysics();
  }

  function findDropTarget(bubble) {
    let best = null;
    let bestDist = Infinity;
    for (const o of bubbles.values()) {
      if (o === bubble) continue;
      const d = Math.hypot(o.x - bubble.x, o.y - bubble.y);
      if (d < OVERLAP_THRESHOLD && d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    return best;
  }

  function highlightDropTarget(bubble, target) {
    for (const o of bubbles.values()) {
      if (o === bubble) continue;
      o.el.style.outline = target === o ? `3px dashed ${hslCss(o.color)}` : '';
    }
  }

  function clearDropHighlight() {
    for (const o of bubbles.values()) o.el.style.outline = '';
  }

  // ---------- Bubble creation ----------

  function startCreateBubble(x, y) {
    if (creatingBubble) cancelCreating();
    if (selectedBubble) deselectBubble(selectedBubble);

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
    worldEl.appendChild(el);
    bubble.el = el;
    positionEl(bubble);
    renderBubbleContent(bubble);

    creatingBubble = bubble;
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
      if (!bubble.el.contains(e.target)) cancelCreating();
    };
    bubble._outsideHandler = outsideHandler;
    document.addEventListener('mousedown', outsideHandler, true);
  }

  function cancelCreating() {
    if (!creatingBubble) return;
    const bubble = creatingBubble;
    document.removeEventListener('mousedown', bubble._outsideHandler, true);
    bubble.el.remove();
    creatingBubble = null;
  }

  function finalizeCreate(bubble, titleValue, expandAfter) {
    const title = titleValue.trim();
    if (!title) {
      cancelCreating();
      return;
    }
    document.removeEventListener('mousedown', bubble._outsideHandler, true);
    creatingBubble = null;

    bubbleRepository.createBubble({ title, color: bubble.color, parents: [] }).then((data) => {
      bubble.id = data.id;
      bubble.title = data.title;
      bubble.created = data.created;
      bubble.done = data.done;
      bubble.parents = data.parents;
      bubble.description = data.description;
      bubble.creating = false;

      bubbles.set(bubble.id, bubble);
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
        draggingBubble = bubble;
        bubble.el.classList.add('dragging');
        wakePhysics();
      }
      if (dragStarted) {
        bubble.x = startWorld.x + dxScreen / zoom;
        bubble.y = startWorld.y + dyScreen / zoom;
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
        draggingBubble = null;
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

  // ---------- Links rendering ----------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Hover state for links is tracked in JS (by parent/child id pair) rather than via
  // CSS :hover, because rebuildLinksSVG can recreate these elements every physics
  // frame while bubbles are still settling - a freshly recreated element wouldn't
  // reliably inherit native :hover state without a fresh pointer event.
  let mouseScreen = null;
  let hoveredLinkKey = null;
  const LINK_HOVER_THRESHOLD = 10;

  function linkKey(childId, parentId) {
    return childId + '::' + parentId;
  }

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function updateLinkHover() {
    let closestKey = null;
    let closestDist = LINK_HOVER_THRESHOLD;
    if (mouseScreen) {
      for (const b of bubbles.values()) {
        for (const pid of b.parents) {
          const p = bubbles.get(pid);
          if (!p) continue;
          const x1 = p.x * zoom + pan.x, y1 = p.y * zoom + pan.y;
          const x2 = b.x * zoom + pan.x, y2 = b.y * zoom + pan.y;
          const d = distanceToSegment(mouseScreen.x, mouseScreen.y, x1, y1, x2, y2);
          if (d < closestDist) {
            closestDist = d;
            closestKey = linkKey(b.id, pid);
          }
        }
      }
    }
    if (closestKey !== hoveredLinkKey) {
      hoveredLinkKey = closestKey;
      rebuildLinksSVG();
    }
  }

  function rebuildLinksSVG() {
    clearEl(linksLayerEl);
    for (const b of bubbles.values()) {
      if (!b.parents.length) continue;
      for (const pid of b.parents) {
        const p = bubbles.get(pid);
        if (!p) continue;

        const midX = (p.x + b.x) / 2;
        const midY = (p.y + b.y) / 2;
        const isHovered = hoveredLinkKey === linkKey(b.id, pid);

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'link-group' + (isHovered ? ' active' : ''));
        g.style.setProperty('--link-color', hslCss(p.color));

        const visible = document.createElementNS(SVG_NS, 'line');
        visible.setAttribute('x1', p.x);
        visible.setAttribute('y1', p.y);
        visible.setAttribute('x2', b.x);
        visible.setAttribute('y2', b.y);
        visible.setAttribute('class', 'link-visible');

        const xGroup = document.createElementNS(SVG_NS, 'g');
        xGroup.setAttribute('class', 'link-x');
        xGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

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
          unlinkBubbles(b, p);
        });

        g.appendChild(visible);
        g.appendChild(xGroup);
        linksLayerEl.appendChild(g);
      }
    }
  }

  // ---------- Physics ----------

  function stepPhysics(dt) {
    const list = Array.from(bubbles.values());
    const forces = new Map(list.map((b) => [b.id, { fx: 0, fy: 0 }]));

    const addForce = (id, fx, fy) => {
      const f = forces.get(id);
      f.fx += fx;
      f.fy += fy;
    };

    // Repulsion between unrelated bubbles, and a strong push apart for any bubbles
    // that visually intersect (regardless of link status). Computed once per pair
    // and applied symmetrically to both sides.
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const o = list[j];
        const dx = o.x - b.x, dy = o.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) dist = 0.01;

        const combinedRadius = bubbleRadius(b) + bubbleRadius(o);
        const overlap = combinedRadius - dist;
        if (overlap > 0) {
          const strength = (overlap / combinedRadius) * INTERSECT_PUSH;
          const fx = (dx / dist) * strength, fy = (dy / dist) * strength;
          addForce(b.id, -fx, -fy);
          addForce(o.id, fx, fy);
          continue;
        }

        const linked = b.parents.includes(o.id) || o.parents.includes(b.id);
        if (linked) continue;
        if (dist < REPEL_FORCE) {
          const strength = ((REPEL_FORCE - dist) / REPEL_FORCE) * 1.2;
          const fx = (dx / dist) * strength, fy = (dy / dist) * strength;
          addForce(b.id, -fx, -fy);
          addForce(o.id, fx, fy);
        }
      }
    }

    // Parent/child link: a single spring keeping them LINK_DISTANCE apart, with a
    // gentle bias so the child prefers settling below its parent. Applied equally
    // and oppositely to both ends, so a crowded parent gets pulled back toward its
    // children instead of only ever being pushed away by them.
    const childCounts = new Map(list.map((b) => [b.id, 0]));
    for (const child of list) {
      for (const pid of child.parents) {
        const parent = bubbles.get(pid);
        if (!parent) continue;
        childCounts.set(pid, (childCounts.get(pid) || 0) + 1);

        const dx = child.x - parent.x, dy = child.y - parent.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const diff = dist - LINK_DISTANCE;
        const downBias = child.done ? -LINK_DOWN_BIAS : LINK_DOWN_BIAS;
        const fx = -(dx / dist) * diff * LINK_SPRING;
        const fy = -(dy / dist) * diff * LINK_SPRING + downBias;

        addForce(child.id, fx, fy);
        addForce(parent.id, -fx, -fy);
      }
    }

    // Bubbles stranded far from everything else drift back toward their nearest neighbor.
    for (const b of list) {
      let nearestDist = Infinity, nearest = null;
      for (const o of list) {
        if (o === b) continue;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d < nearestDist) { nearestDist = d; nearest = o; }
      }
      if (nearest && nearestDist > MAX_DISTANCE) {
        const dx = nearest.x - b.x, dy = nearest.y - b.y;
        const d = nearestDist || 0.01;
        const excess = nearestDist - MAX_DISTANCE;
        addForce(b.id, (dx / d) * excess * 0.02, (dy / d) * excess * 0.02);
      }
    }

    for (const b of list) {
      if (b.selected || b === draggingBubble) { b.vx = 0; b.vy = 0; continue; }
      const { fx, fy } = forces.get(b.id);
      const mass = 1 + (childCounts.get(b.id) || 0) * MASS_PER_CHILD;

      b.vx = (b.vx + (fx / mass) * dt) * 0.82;
      b.vy = (b.vy + (fy / mass) * dt) * 0.82;
      const forceMag = Math.hypot(fx, fy) / mass;
      const maxSpeed = Math.min(40, 6 + forceMag * 1.5);
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > maxSpeed) {
        b.vx = (b.vx / speed) * maxSpeed;
        b.vy = (b.vy / speed) * maxSpeed;
      }
    }

    let totalMovement = 0;
    for (const b of list) {
      if (b.selected || b === draggingBubble) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      positionEl(b);
      totalMovement += Math.hypot(b.vx, b.vy);
    }
    return totalMovement;
  }

  // Once bubbles have settled (little to no movement for a while), stop scheduling
  // physics frames entirely to save CPU. Any interaction that could require bubbles
  // to move again (create, link, delete, select, drag) calls wakePhysics() to resume.
  const QUIET_THRESHOLD_FRAMES = 50;
  const QUIET_MOVEMENT_EPSILON = 1.7;
  let quietFrames = 0;
  let physicsAsleep = false;
  let lastTime = null;

  // While a dragged bubble is hovering over a valid drop target, physics is paused so
  // the highlighted target doesn't drift or get repelled away before the user can
  // release the mouse to link. pauseDragPhysics()/wakePhysics() toggle this.
  let physicsPaused = false;

  function pauseDragPhysics() {
    physicsPaused = true;
  }

  function wakePhysics() {
    quietFrames = 0;
    const wasStopped = physicsAsleep || physicsPaused;
    physicsAsleep = false;
    physicsPaused = false;
    if (wasStopped) {
      lastTime = null;
      requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    if (physicsPaused) return;
    if (lastTime == null) lastTime = now;
    let dt = (now - lastTime) / 16.6667;
    dt = Math.min(dt, 3);
    lastTime = now;

    const totalMovement = stepPhysics(dt);
    rebuildLinksSVG();

    if (draggingBubble || totalMovement >= QUIET_MOVEMENT_EPSILON) {
      quietFrames = 0;
    } else {
      quietFrames++;
    }

    if (quietFrames > QUIET_THRESHOLD_FRAMES) {
      physicsAsleep = true;
      return;
    }

    requestAnimationFrame(tick);
  }

  // ---------- Done list ----------

  function openDoneList() {
    bubbleRepository.listBubbles().then((list) => {
      const doneItems = list.filter((b) => b.done).sort((a, b) => new Date(b.done) - new Date(a.done));
      renderDoneList(doneItems);
      doneListOverlay.classList.remove('hidden');
    });
  }

  function closeDoneList() {
    doneListOverlay.classList.add('hidden');
  }

  function monthYearLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  function renderDoneList(items) {
    clearEl(doneListItemsEl);
    let lastMonthLabel = null;
    let currentGroupList = null;
    let isFirstGroup = true;

    items.forEach((data) => {
      const monthLabel = monthYearLabel(data.done);
      if (monthLabel && monthLabel !== lastMonthLabel) {
        const groupLi = document.createElement('li');
        groupLi.className = 'done-month-group';

        const divider = document.createElement('div');
        divider.className = 'done-month-divider';
        const label = document.createElement('span');
        label.textContent = `${monthLabel} --`;
        const caret = document.createElement('span');
        caret.className = 'done-month-caret';
        divider.appendChild(label);
        divider.appendChild(caret);

        const groupList = document.createElement('ul');
        groupList.className = 'done-month-items';

        const collapsed = !isFirstGroup;
        groupList.classList.toggle('hidden', collapsed);
        caret.textContent = collapsed ? '▸' : '▾';

        divider.addEventListener('click', () => {
          const nowCollapsed = !groupList.classList.contains('hidden');
          groupList.classList.toggle('hidden', nowCollapsed);
          caret.textContent = nowCollapsed ? '▸' : '▾';
        });

        groupLi.appendChild(divider);
        groupLi.appendChild(groupList);
        doneListItemsEl.appendChild(groupLi);

        currentGroupList = groupList;
        lastMonthLabel = monthLabel;
        isFirstGroup = false;
      }

      const li = document.createElement('li');
      li.className = 'done-item';

      const titleRow = document.createElement('div');
      titleRow.className = 'done-item-title';
      const span = document.createElement('span');
      span.textContent = data.title;
      const caret = document.createElement('span');
      caret.textContent = '▾';
      titleRow.appendChild(span);
      titleRow.appendChild(caret);
      li.appendChild(titleRow);

      const details = document.createElement('div');
      details.className = 'done-item-details hidden';

      const createdP = document.createElement('div');
      createdP.textContent = 'Created: ' + formatDate(data.created);
      const doneP = document.createElement('div');
      doneP.textContent = 'Marked done: ' + formatDate(data.done);
      const descP = document.createElement('div');
      descP.style.whiteSpace = 'pre-wrap';
      descP.style.marginTop = '6px';
      descP.textContent = data.description || '(no description)';
      const unmarkBtn = document.createElement('button');
      unmarkBtn.className = 'unmark-btn';
      unmarkBtn.textContent = 'Unmark as Done';
      unmarkBtn.addEventListener('click', () => unmarkDone(data, li));

      details.appendChild(createdP);
      details.appendChild(doneP);
      details.appendChild(descP);
      details.appendChild(unmarkBtn);
      li.appendChild(details);

      titleRow.addEventListener('click', () => details.classList.toggle('hidden'));
      currentGroupList.appendChild(li);
    });
  }

  function unmarkDone(data, li) {
    setDoneState(data.id, '').then((updated) => {
      li.remove();
      addExistingBubbleToMainView(updated);
    });
  }

  // ---------- Settings ----------
  //
  // FRAMEWORK - to add a new setting:
  //   1. In index.html, add a ".settings-row" inside #settingsBody with a label and
  //      an input/select/checkbox for the setting (see the example comment there).
  //   2. Add a key + default value for it to the `settings` object below.
  //   3. In `bindSettingsControls()`, look up the control by id and sync its value from
  //      `settings.<key>` (this part runs every time the modal opens). Then, inside the
  //      `if (settingsControlsBound) return;` guard, add a change/input listener that
  //      updates `settings.<key>` and calls `applySetting('<key>')`. The guard ensures the
  //      listener is only attached once, no matter how many times the modal is reopened.
  //   4. In `applySetting()`, add a case for `<key>` that makes the setting take effect.
  //
  // Settings are in-memory only right now (defaults reset on reload). To persist them,
  // save `settings` to localStorage (or a server endpoint) whenever it changes, and load
  // it back into `settings` before bindSettingsControls() runs the first time.

  const settings = {
    // exampleSetting: false,
    showCompletedSetting: false,
    repelForce: REPEL_FORCE,
    maxDistance: MAX_DISTANCE,
    linkDistance: LINK_DISTANCE,
  };

  function openSettings() {
    bindSettingsControls();
    settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    settingsOverlay.classList.add('hidden');
  }

  // True once the settings controls' change/input listeners have been attached. Only the
  // value-syncing should happen on every open; listeners are attached a single time.
  let settingsControlsBound = false;

  // Syncs each settings control to the current value in `settings`, and (the first time
  // only) attaches its change listener. Called every time the modal opens.
  function bindSettingsControls() {
    // Example:
    // const exampleInput = document.getElementById('exampleSetting');
    // exampleInput.checked = settings.exampleSetting;

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

    // Example:
    // exampleInput.addEventListener('change', () => {
    //   settings.exampleSetting = exampleInput.checked;
    //   applySetting('exampleSetting');
    // });

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
    // switch (key) {
    //   case 'exampleSetting':
    //     ...
    //     break;
    // }
    switch (key) {
      case 'showCompletedSetting':
        if (settings.showCompletedSetting) {
          loadDoneBubbles();
        } else {
          hideDoneBubbles();
        }
        break;
      case 'repelForce':
        REPEL_FORCE = settings.repelForce;
        wakePhysics();
        break;
      case 'maxDistance':
        MAX_DISTANCE = settings.maxDistance;
        wakePhysics();
        break;
      case 'linkDistance':
        LINK_DISTANCE = settings.linkDistance;
        wakePhysics();
        break;
    }
  }

  function saveBackup() {
    bubbleRepository.exportBackup().catch((e) => alert('Could not save backup: ' + e.message));
  }

  function recallBackup() {
    bubbleRepository.importBackup().then((data) => {
      if (!data) return; // cancelled
      if (!confirm(`This will permanently overwrite your current Pop data with the ${data.length} bubble(s) in this file. This cannot be undone.`)) return;
      return bubbleRepository.replaceAll(data).then(() => location.reload());
    }).catch((e) => alert('That file is not a valid Pop backup.\n' + e.message));
  }

  function defaultPositionForNewBubble(data, above) {
    const parentObjs = (data.parents || []).map((pid) => bubbles.get(pid)).filter(Boolean);
    const offset = above ? -LINK_DISTANCE : LINK_DISTANCE;
    if (parentObjs.length) {
      const avgX = parentObjs.reduce((s, p) => s + p.x, 0) / parentObjs.length;
      const avgY = parentObjs.reduce((s, p) => s + p.y, 0) / parentObjs.length;
      return { x: avgX + (Math.random() - 0.5) * 60, y: avgY + offset };
    }
    return screenToWorld(window.innerWidth / 2 + (Math.random() - 0.5) * 100, window.innerHeight / 2 + (Math.random() - 0.5) * 100);
  }

  function addExistingBubbleToMainView(data) {
    const existing = bubbles.get(data.id);
    if (existing) {
      existing.title = data.title;
      existing.created = data.created;
      existing.done = data.done;
      existing.parents = data.parents;
      existing.color = data.color;
      existing.description = data.description;
      existing.selected = false;
      if (selectedBubble === existing) selectedBubble = null;
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
    bubbles.set(bubble.id, bubble);
    wakePhysics();
  }

  // ---------- Show Completed ----------

  function loadDoneBubbles() {
    bubbleRepository.listBubbles().then((list) => {
      const doneItems = list.filter((b) => b.done && !bubbles.has(b.id));
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
        bubbles.set(bubble.id, bubble);
      });
      wakePhysics();
    });
  }

  function hideDoneBubbles() {
    for (const b of Array.from(bubbles.values())) {
      if (!b.done) continue;
      if (selectedBubble === b) selectedBubble = null;
      b.el.remove();
      bubbles.delete(b.id);
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
          c._y = b._y + LINK_DISTANCE;
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

  function loadBubbles() {
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
        bubbles.set(bubble.id, bubble);
      });
      rebuildLinksSVG();
      requestAnimationFrame(tick);
    }).catch((err) => alert('Failed to load Pop data: ' + err.message));
  }

  // ---------- Canvas pan / zoom / creation ----------

  canvasEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (selectedBubble) deselectBubble(selectedBubble);
    isPanning = true;
    canvasEl.classList.add('panning');
    panStartScreen = { x: e.clientX, y: e.clientY };
    panStartPan = { x: pan.x, y: pan.y };
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    pan.x = panStartPan.x + (e.clientX - panStartScreen.x);
    pan.y = panStartPan.y + (e.clientY - panStartScreen.y);
    applyTransform();
    updateLinkHover();
  });

  document.addEventListener('mouseup', () => {
    isPanning = false;
    canvasEl.classList.remove('panning');
  });

  canvasEl.addEventListener('mousemove', (e) => {
    mouseScreen = { x: e.clientX, y: e.clientY };
    updateLinkHover();
  });

  canvasEl.addEventListener('mouseleave', () => {
    mouseScreen = null;
    updateLinkHover();
  });

  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const worldPt = screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom = Math.min(3, Math.max(0.2, zoom * factor));
    pan.x = mx - worldPt.x * zoom;
    pan.y = my - worldPt.y * zoom;
    applyTransform();
    updateLinkHover();
  }, { passive: false });

  canvasEl.addEventListener('dblclick', (e) => {
    if (e.target !== canvasEl && e.target !== worldEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const worldPt = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    startCreateBubble(worldPt.x, worldPt.y);
  });

  addBubbleBtn.addEventListener('click', () => {
    const worldPt = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    startCreateBubble(worldPt.x, worldPt.y);
  });

  doneListBtn.addEventListener('click', openDoneList);
  doneListCloseBtn.addEventListener('click', closeDoneList);
  doneListOverlay.addEventListener('mousedown', (e) => {
    if (e.target === doneListOverlay) closeDoneList();
  });

  settingsBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('mousedown', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  saveBackupBtn.addEventListener('click', saveBackup);
  recallBackupBtn.addEventListener('click', recallBackup);

  applyTransform();
  loadBubbles();
})();
