// Rectangular multi-select: drag a box over empty canvas to select several
// bubbles at once (any bubble the box touches, not just fully-enclosed ones),
// then bulk delete or mark them done via the panel that drops down from the
// top of the screen. Physics stays asleep for as long as a multi-selection is
// active - resetSelection() is the only thing that wakes it back up.

import { dom, state } from './state.js';
import { hslCss } from './utils.js';
import { wakePhysics, pausePhysics } from './physics.js';
import { selectBubble, deleteBubbles, markBubblesDone, unmarkBubblesDone } from './bubbles.js';

function setHighlight(bubble, on) {
  bubble.el.style.outline = on ? `3px dashed ${hslCss(bubble.color)}` : '';
}

function hidePanel() {
  dom.selectionActionsPanel.classList.remove('open');
}

function updatePanel() {
  const bubbles = Array.from(state.selectedBubbles);
  const doneCount = bubbles.filter((b) => b.done).length;
  const allDone = bubbles.length > 0 && doneCount === bubbles.length;
  const noneDone = doneCount === 0;

  dom.selectionMarkDoneBtn.disabled = !allDone && !noneDone;
  dom.selectionMarkDoneBtn.textContent = allDone ? 'Unmark as Done' : 'Mark as Done';
  dom.selectionActionsPanel.classList.add('open');
}

export function resetSelection() {
  if (state.selectedBubbles.size) {
    for (const b of state.selectedBubbles) setHighlight(b, false);
    state.selectedBubbles.clear();
  }
  hidePanel();
  wakePhysics();
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function bubblesInRect(rect) {
  const found = [];
  for (const b of state.bubbles.values()) {
    if (rectsOverlap(rect, b.el.getBoundingClientRect())) found.push(b);
  }
  return found;
}

export function startBoxSelect(e) {
  resetSelection();
  pausePhysics();

  const startX = e.clientX, startY = e.clientY;
  let highlighted = [];
  dom.selectionBoxEl.classList.remove('hidden');

  function setBoxRect(x, y, w, h) {
    dom.selectionBoxEl.style.left = x + 'px';
    dom.selectionBoxEl.style.top = y + 'px';
    dom.selectionBoxEl.style.width = w + 'px';
    dom.selectionBoxEl.style.height = h + 'px';
  }
  setBoxRect(startX, startY, 0, 0);

  function onMove(ev) {
    const x = Math.min(startX, ev.clientX);
    const y = Math.min(startY, ev.clientY);
    const w = Math.abs(ev.clientX - startX);
    const h = Math.abs(ev.clientY - startY);
    setBoxRect(x, y, w, h);

    const found = bubblesInRect({ left: x, top: y, right: x + w, bottom: y + h });
    const foundSet = new Set(found);
    for (const b of highlighted) if (!foundSet.has(b)) setHighlight(b, false);
    for (const b of found) setHighlight(b, true);
    highlighted = found;
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    dom.selectionBoxEl.classList.add('hidden');

    if (highlighted.length === 0) {
      wakePhysics();
    } else if (highlighted.length === 1) {
      setHighlight(highlighted[0], false);
      wakePhysics();
      selectBubble(highlighted[0]);
    } else {
      state.selectedBubbles = new Set(highlighted);
      updatePanel();
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function deleteAllSelected() {
  const bubbles = Array.from(state.selectedBubbles);
  deleteBubbles(bubbles);
  resetSelection();
}

export function toggleDoneAllSelected() {
  if (dom.selectionMarkDoneBtn.disabled) return;
  const bubbles = Array.from(state.selectedBubbles);
  if (bubbles.every((b) => b.done)) {
    unmarkBubblesDone(bubbles);
  } else {
    markBubblesDone(bubbles);
  }
  resetSelection();
}
