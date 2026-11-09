const metadata = [...document.querySelectorAll('.metadata input')];
const abstract = document.querySelector('#abstract');
const preview = document.querySelector('#article-preview');
const editText = document.querySelector('#edit-text');
const showAll = document.querySelector('#show-all');
const strong = document.querySelector('#strong');
const soft = document.querySelector('#soft');
const clearHighlights = document.querySelector('#clear-highlights');
const add = document.querySelector('#add');
const relation = document.querySelector('#relation');
const parent = document.querySelector('#parent');
const editPlanet = document.querySelector('#edit-planet');
const cancelEdit = document.querySelector('#cancel-edit');
const remove = document.querySelector('#remove');
const status = document.querySelector('#status');
const map = document.querySelector('#map');
const file = document.querySelector('#file');

let article = {version: 2, title: '', text: '', nucleus: null, spans: []};
let selectedId = null;
let pendingRange = null;
let draftHighlights = [];
let originalHighlights = null;

function describe(planet) {
  const text = article.text.slice(planet.start, planet.end).trim().replace(/\s+/g, ' ');
  return `${BNITZ.label(planet)} · ${text.length > 42 ? text.slice(0, 42) + '…' : text}`;
}

function possibleParents(planet) {
  if (!planet) return article.spans;
  const byId = new Map(article.spans.map(span => [span.id, span]));
  return article.spans.filter(candidate => {
    for (let ancestor = candidate; ancestor; ancestor = byId.get(ancestor.parent)) {
      if (ancestor.id === planet.id) return false;
    }
    return true;
  });
}

function controls() {
  const previous = parent.value;
  const hasNucleus = Boolean(article.nucleus);
  const editing = Boolean(originalHighlights);
  const planet = editing ? article.spans.find(item => item.id === selectedId) : null;
  const editingNucleus = planet?.id === article.nucleus;
  const options = Object.entries(BNITZ.relations).map(([key, [label]]) => {
    const option = new Option(label, key);
    option.disabled = !hasNucleus;
    return option;
  });
  const nucleus = new Option('Nucleus', 'nucleus');
  nucleus.disabled = hasNucleus && !editingNucleus;
  relation.replaceChildren(new Option('Choose a relation', ''), nucleus, ...options);
  relation.value = planet?.relation ?? (hasNucleus && !editingNucleus ? '' : 'nucleus');
  relation.disabled = editingNucleus;
  parent.disabled = !hasNucleus || editingNucleus;
  parent.replaceChildren(...(!parent.disabled
    ? possibleParents(planet).map(candidate => new Option(describe(candidate), candidate.id))
    : [new Option('—', '')]));
  if (planet) parent.value = planet.parent ?? '';
  else parent.value = article.spans.some(planet => planet.id === previous) ? previous : article.nucleus ?? '';
  add.textContent = editing ? 'Save changes' : 'Add planet';
  clearHighlights.textContent = editing ? 'Clear highlights' : 'Clear pending highlights';
  cancelEdit.hidden = !editing;
  editText.disabled = map.inert = editing;
}

function renderArticle() {
  const planets = article.spans.filter(planet => planet.id === selectedId ? !originalHighlights : showAll.checked);
  BNITZ.paintText(preview, article.text, [...planets.flatMap(BNITZ.highlights), ...draftHighlights]);
  remove.hidden = editPlanet.hidden = !selectedId || Boolean(originalHighlights);
  editPlanet.disabled = Boolean(draftHighlights.length);
  clearHighlights.hidden = !draftHighlights.length;
  add.disabled = !draftHighlights.length && (!originalHighlights || Boolean(originalHighlights.length));
  updateHighlightButtons();
}

function captureSelection() {
  if (preview.hidden) return;
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const startsInside = preview.contains(range.startContainer);
  const endsInside = preview.contains(range.endContainer);
  if (!startsInside && !endsInside) {
    pendingRange = null;
    return;
  }
  // A drag past the text can place one endpoint outside the preview.
  const prefix = document.createRange();
  prefix.selectNodeContents(preview);
  const offsetInPreview = (node, offset) => {
    prefix.setEnd(node, offset);
    return prefix.toString().length;
  };
  pendingRange = {
    start: startsInside ? offsetInPreview(range.startContainer, range.startOffset) : 0,
    end: endsInside ? offsetInPreview(range.endContainer, range.endOffset) : article.text.length,
  };
}

function selectedRange() {
  if (preview.hidden) return {start: abstract.selectionStart, end: abstract.selectionEnd};
  captureSelection();
  return pendingRange;
}

function updateHighlightButtons() {
  const {start, end} = selectedRange() ?? {};
  strong.disabled = soft.disabled = !BNITZ.validRange(article.text, start, end);
}

function editMode(editing) {
  pendingRange = selectedRange();
  abstract.hidden = !editing;
  preview.hidden = editing;
  editText.textContent = editing ? 'Done editing' : 'Edit text';
  if (editing) {
    abstract.focus();
    if (pendingRange) abstract.setSelectionRange(pendingRange.start, pendingRange.end);
    updateHighlightButtons();
  } else {
    renderArticle();
  }
}

function selectPlanet(planet) {
  selectedId = planet.id;
  BNITZ.select(map, selectedId);
  showLegendRelation(planet.relation ?? 'nucleus');
  if (preview.hidden) editMode(false);
  else renderArticle();
  pendingRange = null;
  updateHighlightButtons();
  status.textContent = '';
}

function redraw() {
  if (article.nucleus) BNITZ.map(map, article, selectPlanet);
  else map.replaceChildren();
  BNITZ.select(map, selectedId);
  renderArticle();
}

function resetDraft() {
  originalHighlights = pendingRange = null;
  draftHighlights = [];
}

editPlanet.addEventListener('click', () => {
  const planet = article.spans.find(item => item.id === selectedId);
  if (!planet || draftHighlights.length) return;
  if (preview.hidden) editMode(false);
  pendingRange = null;
  originalHighlights = draftHighlights = BNITZ.highlights(planet);
  controls();
  renderArticle();
  (relation.disabled ? preview : relation).focus();
});

cancelEdit.addEventListener('click', () => {
  resetDraft();
  controls();
  parent.value = article.nucleus;
  renderArticle();
  status.textContent = '';
  editPlanet.focus();
});

document.addEventListener('selectionchange', updateHighlightButtons);
abstract.addEventListener('select', updateHighlightButtons);
function updatePreviewSelection() {
  if (window.getSelection().isCollapsed) pendingRange = null;
  updateHighlightButtons();
}
preview.addEventListener('pointerup', updatePreviewSelection);
preview.addEventListener('keyup', updatePreviewSelection);
editText.addEventListener('click', () => editMode(abstract.hidden));
showAll.addEventListener('change', () => {
  if (showAll.checked && preview.hidden) editMode(false);
  else renderArticle();
});

function setHighlight(grade) {
  const {start, end} = selectedRange() ?? {};
  if (!BNITZ.validRange(article.text, start, end)) {
    status.textContent = 'Select text in the article first.';
    return;
  }
  // Replace the color only where the new selection overlaps.
  draftHighlights = draftHighlights.flatMap(range => {
    if (range.end <= start || range.start >= end) return [range];
    const parts = [];
    if (range.start < start) parts.push({...range, end: start});
    if (range.end > end) parts.push({...range, start: end});
    return parts.filter(part => BNITZ.validRange(article.text, part.start, part.end));
  });
  draftHighlights.push({start, end, grade});
  if (!originalHighlights) selectedId = null;
  BNITZ.select(map, selectedId);
  window.getSelection().removeAllRanges();
  if (preview.hidden) editMode(false);
  pendingRange = null;
  renderArticle();
  status.textContent = '';
}
for (const [button, grade] of [[strong, 'strong'], [soft, 'soft']]) {
  // Keep the article selection intact until the click applies it.
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', () => setHighlight(grade));
}
clearHighlights.addEventListener('click', () => {
  draftHighlights = [];
  renderArticle();
  status.textContent = '';
});

abstract.addEventListener('paste', event => {
  const text = event.clipboardData?.getData('text/plain');
  if (!text) return;
  // PDF text often uses a line break for each line and a blank line between paragraphs.
  const reflowed = text.replace(/\r\n?/g, '\n').split(/(\n(?:[ \t]*\n)+)/)
    .map((part, index) => index % 2 ? part : part.replace(/([-\u00ad])?[ \t]*\n[ \t]*/g,
      (_, hyphen) => hyphen === '\u00ad' ? '' : hyphen ?? ' '))
    .join('');
  if (reflowed === text) return;
  event.preventDefault();
  // Use the browser's editing command when available so Undo works after a paste.
  if (document.activeElement === abstract && document.execCommand('insertText', false, reflowed)) return;
  abstract.setRangeText(reflowed, abstract.selectionStart, abstract.selectionEnd, 'end');
  abstract.dispatchEvent(new Event('input', {bubbles: true}));
});

abstract.addEventListener('input', () => {
  const previous = article.text;
  const next = abstract.value;
  let left = 0, before = previous.length, after = next.length;
  while (left < before && left < after && previous[left] === next[left]) left++;
  while (before > left && after > left && previous[before - 1] === next[after - 1]) {
    before--;
    after--;
  }
  const shift = after - before;
  function remap(range) {
    if (range.end <= left) return range;
    if (range.start >= before) return {...range, start: range.start + shift, end: range.end + shift};
    return {...range, start: Math.min(range.start, left), end: range.end > before ? range.end + shift : after};
  }
  const spans = article.spans.map(planet => {
    const updated = {...remap(planet)};
    if (planet.highlights) {
      updated.highlights = planet.highlights.map(remap).filter(range => BNITZ.validRange(next, range.start, range.end));
    }
    return updated;
  });
  if (spans.some(planet => !BNITZ.validRange(next, planet.start, planet.end))) {
    abstract.value = previous;
    abstract.setSelectionRange(left, before);
    status.textContent = 'Remove the affected planet before deleting its text.';
    return;
  }
  article = {...article, text: next, spans};
  draftHighlights = draftHighlights.map(remap).filter(range => BNITZ.validRange(next, range.start, range.end));
  for (const option of parent.options) {
    const planet = spans.find(item => item.id === option.value);
    if (planet) option.text = describe(planet);
  }
  redraw();
  status.textContent = '';
});

document.querySelector('#annotation').addEventListener('submit', event => {
  event.preventDefault();
  if (add.disabled) {
    status.textContent = 'Highlight text before saving the planet.';
    return;
  }
  const editing = Boolean(originalHighlights);
  if (draftHighlights !== originalHighlights) draftHighlights.sort((a, b) => a.start - b.start);
  const first = draftHighlights[0];
  if (editing) {
    const planet = article.spans.find(item => item.id === selectedId);
    if (planet.id !== article.nucleus) {
      planet.parent = parent.value;
      planet.relation = relation.value;
    }
    if (draftHighlights !== originalHighlights) {
      planet.highlights = draftHighlights;
      if (first) {
        planet.start = first.start;
        planet.end = first.end;
      }
    }
  } else {
    let nextId = article.spans.length + 1;
    while (article.spans.some(planet => planet.id === `s${nextId}`)) nextId++;
    const id = `s${nextId}`;
    const planet = {id, start: first.start, end: first.end, highlights: draftHighlights};
    if (article.nucleus) {
      planet.parent = parent.value;
      planet.relation = relation.value;
    } else {
      article.nucleus = id;
    }
    article.spans.push(planet);
    selectedId = id;
  }
  resetDraft();
  if (preview.hidden) editMode(false);
  pendingRange = null;
  controls();
  parent.value = article.nucleus;
  redraw();
  status.textContent = '';
  if (editing) editPlanet.focus();
});

remove.addEventListener('click', () => {
  const planet = article.spans.find(item => item.id === selectedId);
  if (!planet) return;
  if (planet.id === article.nucleus && article.spans.length > 1) {
    status.textContent = 'Remove the other planets before removing the nucleus.';
    return;
  }
  if (planet.id === article.nucleus) article.nucleus = null;
  article.spans = article.spans.filter(item => item !== planet)
    .map(item => item.parent === planet.id ? {...item, parent: planet.parent} : item);
  selectedId = pendingRange = null;
  controls();
  redraw();
  status.textContent = '';
});

document.querySelector('#open').addEventListener('click', () => file.click());
file.addEventListener('change', async () => {
  const [selected] = file.files;
  file.value = '';
  if (!selected) return;
  try {
    const opened = BNITZ.validate(JSON.parse(await selected.text()));
    if ((abstract.value || metadata.some(field => field.value)) && !window.confirm('Replace the current draft?')) return;
    article = opened;
    resetDraft();
    for (const field of metadata) field.value = article[field.id] ?? '';
    abstract.value = article.text;
    selectedId = null;
    abstract.hidden = true;
    preview.hidden = false;
    editText.textContent = 'Edit text';
    controls();
    redraw();
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector('#save').addEventListener('click', () => {
  try {
    if (originalHighlights) throw new Error('Save or cancel the planet changes before exporting.');
    if (draftHighlights.length) throw new Error('Add a planet or clear the pending highlights before exporting.');
    const result = {...article};
    for (const field of metadata) {
      if (!field.reportValidity()) return;
      const value = field.value.trim();
      if (value) result[field.id] = field.type === 'number' ? field.valueAsNumber : value;
      else delete result[field.id];
    }
    BNITZ.validate(result);
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    const filename = result.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_/, '').slice(0, 90).replace(/_$/, '');
    link.download = (filename || 'abstract') + '.bnitz';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  }
});

const showLegendRelation = BNITZ.legend(document.querySelector('#legend'), key => {
  const option = [...relation.options].find(option => option.value === key);
  if (!relation.disabled && option && !option.disabled) relation.value = key;
});
for (const event of ['click', 'change']) {
  relation.addEventListener(event, () => showLegendRelation(relation.value));
}

controls();
