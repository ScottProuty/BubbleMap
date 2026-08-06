// The "Done List" overlay: a month-grouped, collapsible history of completed bubbles.

import { dom } from './state.js';
import { clearEl, formatDate } from './utils.js';
import { setDoneState, addExistingBubbleToMainView } from './bubbles.js';
import bubbleRepository from './storage/bubbleRepository.js';

function monthYearLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function unmarkDone(data, li) {
  setDoneState(data.id, '').then((updated) => {
    li.remove();
    addExistingBubbleToMainView(updated);
  });
}

function renderDoneList(items) {
  clearEl(dom.doneListItemsEl);
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
      dom.doneListItemsEl.appendChild(groupLi);

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

export function openDoneList() {
  bubbleRepository.listBubbles().then((list) => {
    const doneItems = list.filter((b) => b.done).sort((a, b) => new Date(b.done) - new Date(a.done));
    renderDoneList(doneItems);
    dom.doneListOverlay.classList.remove('hidden');
  });
}

export function closeDoneList() {
  dom.doneListOverlay.classList.add('hidden');
}
