const {textElement} = BNITZView;
const readings = document.querySelector('#readings');
const papers = document.querySelector('#papers');
const reading = document.querySelector('#reading');
const title = document.querySelector('#title');
const metadata = document.querySelector('#metadata');
const abstract = document.querySelector('#abstract');
const map = document.querySelector('#map');
const status = document.querySelector('#status');
const playground = textElement('a', 'playground');
const playgroundLink = document.querySelector('#playground-link');
const playgroundTools = document.querySelector('#playground-tools');
const importDocument = document.querySelector('#import-document');
const exportDocument = document.querySelector('#export-document');
const resetDocument = document.querySelector('#reset-document');
const documentFile = document.querySelector('#document-file');
const documentStatus = document.querySelector('#document-status');
const documentDetails = document.querySelector('#document-details');
const documentFields = document.querySelector('#document-fields');
const fields = documentFields.elements;
const editor = document.querySelector('#planet-editor');
const addPlanet = document.querySelector('#add-planet');
const removePlanet = document.querySelector('#remove-planet');
const editPlanet = document.querySelector('#edit-planet');
const highlightButton = document.querySelector('#add-highlight');
const clearHighlights = document.querySelector('#clear-highlights');
const hint = document.querySelector('#highlight-hint');
const relation = document.querySelector('#relation');
const parent = document.querySelector('#parent');
const savePlanet = document.querySelector('#save-planet');
const cancelPlanet = document.querySelector('#cancel-planet');
const editorStatus = document.querySelector('#editor-status');
const library = new Map();
const links = new Map();
const segments = [];
let active;
let article;
let selectedId;
let hovered;
let draft;
let pendingRange;
let textSelection;
let workspace;

const showLegendRelation = BNITZView.legend(document.querySelector('#legend'), key => {
  if (!relation.disabled && [...relation.options].some(option => option.value === key)) relation.value = key;
});

function sourceLink(source) {
  if (typeof source !== 'string') return null;
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const link = textElement('a', 'source');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch {
    return null;
  }
}

function renderHeading() {
  const editing = active === workspace;
  title.textContent = article.title || 'Title';
  title.classList.toggle('placeholder', !article.title);
  document.title = `BNITZ - ${editing ? 'Playground' : article.title}`;
  abstract.setAttribute('aria-label', article.title ? `${article.title} article text` : 'Article text');
  const placeholder = label => {
    const span = textElement('span', label);
    span.className = 'placeholder';
    return span;
  };
  const details = [
    article.author || (editing && placeholder('Author')),
    article.year ? textElement('time', article.year) : editing && placeholder('Year'),
    sourceLink(article.source) || (editing && placeholder('Source')),
    !editing && playground].filter(Boolean);
  metadata.replaceChildren(...details.flatMap((part, index) => index ? [' · ', part] : [part]));
}

function openWorkspace(document) {
  workspace = {article: document};
  if (location.hash === '#playground') show();
  else location.hash = '#playground';
}

function openRandomExample() {
  const examples = [...library.values()];
  const example = examples[Math.floor(Math.random() * examples.length)];
  if (example) openWorkspace(structuredClone(example.article));
  else location.hash = '#playground';
}

function checkPassages() {
  documentStatus.textContent = article.spans.some(span => !BNITZModel.validRange(article.text, span.start, span.end))
    ? 'A passage was deleted. Select its planet and set a new highlight, or remove the planet.' : '';
}

function paintArticle() {
  const scrollTop = abstract.scrollTop;
  links.clear();
  segments.length = 0;
  hovered = null;
  const ranges = article.spans.filter(planet => planet !== draft?.planet).flatMap(planet =>
    BNITZModel.highlights(planet).map(range => ({...range, planetId: planet.id})));
  if (draft) ranges.push(...draft.highlights.map(range => ({...range, draft: true})));
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const part of article.text.split(/(\r?\n[ \t]*(?:\r?\n)+)/)) {
    const end = offset + part.length;
    if (part.trim()) {
      const paragraph = document.createElement('p');
      const local = ranges.filter(range => range.start < end && range.end > offset).map(range => ({
        ...range,
        start: Math.max(0, range.start - offset),
        end: Math.min(part.length, range.end - offset),
      }));
      BNITZView.paintText(paragraph, part, local, (mark, matches) => links.set(mark, matches), {
        typeset: true,
        onSegment: (node, start, end) => segments.push({node, start: offset + start, end: offset + end}),
      });
      fragment.append(paragraph);
    }
    offset = end;
  }
  abstract.replaceChildren(fragment);
  abstract.scrollTop = scrollTop;
  highlight();
  updateEditor();
}

function highlight() {
  const ids = new Set(hovered ? links.get(hovered).map(range => range.planetId) : selectedId ? [selectedId] : []);
  BNITZView.select(map, ...ids);
  for (const [mark, ranges] of links) {
    mark.classList.toggle('highlighted', ranges.some(range => range.draft || ids.has(range.planetId)));
  }
}

function hoverText(mark) {
  if (hovered === mark) return;
  hovered = mark;
  highlight();
}

function selectPlanet(planet) {
  hovered = null;
  selectedId = planet && planet.id !== selectedId ? planet.id : null;
  if (planet) showLegendRelation(planet.relation ?? 'core');
  highlight();
  updateEditor();
  editorStatus.textContent = '';
}

function redrawMap() {
  if (article.core) BNITZView.map(map, article, selectPlanet);
  else map.replaceChildren();
  paintArticle();
  if (active === workspace) checkPassages();
}

function selectPrompt(select) {
  const prompt = new Option(select.getAttribute('aria-label'), '', true, true);
  prompt.disabled = true;
  return prompt;
}

function configurePlanetSettings(planet) {
  const isCore = !article.core || planet?.id === article.core;
  if (isCore) {
    relation.replaceChildren(new Option('Core', 'core'));
    parent.replaceChildren(selectPrompt(parent));
    return;
  }
  relation.replaceChildren(selectPrompt(relation), ...Object.entries(BNITZModel.relations)
    .map(([key, [label]]) => new Option(label, key)));
  relation.value = planet?.relation ?? '';
  const byId = new Map(article.spans.map(span => [span.id, span]));
  const options = article.spans.filter(candidate => {
    for (let ancestor = candidate; ancestor; ancestor = byId.get(ancestor.parent)) {
      if (ancestor === planet) return false;
    }
    return true;
  }).map(span => {
    const excerpt = article.text.slice(span.start, span.end).trim().replace(/\s+/g, ' ');
    const label = `${BNITZModel.label(span)} · ${excerpt.length > 42 ? excerpt.slice(0, 42) + '…' : excerpt}`;
    return new Option(label, span.id);
  });
  parent.replaceChildren(selectPrompt(parent), ...options);
  parent.value = planet?.parent ?? article.core;
}

function selectedRange() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return pendingRange;
  const range = selection.getRangeAt(0);
  let first;
  let last;
  // Typeset math and smart quotes are atomic. Plain text keeps its source offsets.
  for (const {node, start, end} of segments) {
    if (!range.intersectsNode(node)) continue;
    const plain = node.nodeType === Node.TEXT_NODE && node.length === end - start;
    const from = plain && range.startContainer === node ? start + range.startOffset : start;
    const to = plain && range.endContainer === node ? start + range.endOffset : end;
    if (from >= to) continue;
    first ??= from;
    last = to;
  }
  pendingRange = first === undefined ? null : {start: first, end: last};
  return pendingRange;
}

function updateHighlightButton() {
  const {start, end} = (draft && selectedRange()) ?? {};
  highlightButton.disabled = !draft || !BNITZModel.validRange(article.text, start, end);
}

function updateEditor() {
  const editing = Boolean(draft);
  const hasHighlights = Boolean(draft?.highlights.length);
  const isCore = !article?.core || draft?.planet?.id === article.core;
  map.inert = editing;
  addPlanet.disabled = editing || !article?.text.trim();
  importDocument.disabled = exportDocument.disabled = documentDetails.inert = editing;
  removePlanet.disabled = editPlanet.disabled = editing || !selectedId;
  clearHighlights.disabled = !hasHighlights;
  cancelPlanet.disabled = !editing;
  hint.style.visibility = editing ? 'visible' : '';
  relation.disabled = parent.disabled = isCore || !(draft?.planet || hasHighlights);
  savePlanet.disabled = !(hasHighlights || (draft?.planet && !draft.original.length));
  updateHighlightButton();
}

function startDraft(planet) {
  const original = planet ? BNITZModel.highlights(planet) : [];
  draft = {planet, original, highlights: original};
  if (!planet) selectedId = null;
  pendingRange = null;
  window.getSelection().removeAllRanges();
  editorStatus.textContent = '';
  configurePlanetSettings(planet);
  paintArticle();
  abstract.focus({preventScroll: true});
}

function resetDraft() {
  draft = pendingRange = null;
  relation.replaceChildren(selectPrompt(relation));
  parent.replaceChildren(selectPrompt(parent));
  editorStatus.textContent = '';
}

function setHighlight() {
  const {start, end} = selectedRange() ?? {};
  if (!BNITZModel.validRange(article.text, start, end)) return;
  const ranges = [...draft.highlights, {start, end}].sort((a, b) => a.start - b.start);
  draft.highlights = [];
  for (const range of ranges) {
    const previous = draft.highlights.at(-1);
    if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
    else draft.highlights.push({...range});
  }
  window.getSelection().removeAllRanges();
  pendingRange = null;
  paintArticle();
}

playgroundLink.addEventListener('click', event => {
  event.preventDefault();
  openRandomExample();
});

playground.href = '#playground';
playground.addEventListener('click', event => {
  event.preventDefault();
  openWorkspace(structuredClone(article));
});

resetDocument.addEventListener('click', () => {
  window.getSelection().removeAllRanges();
  textSelection = undefined;
  showLegendRelation('core');
  openWorkspace({version: 3, title: '', text: '', core: null, spans: []});
});

importDocument.addEventListener('click', () => documentFile.click());
documentFile.addEventListener('change', async () => {
  const file = documentFile.files[0];
  if (!file) return;
  try {
    const imported = BNITZModel.validate(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
    openWorkspace(imported);
  } catch (error) {
    documentStatus.textContent = `Could not import: ${error.message}`;
  } finally {
    documentFile.value = '';
  }
});

exportDocument.addEventListener('click', () => {
  if (!documentFields.checkValidity()) {
    documentDetails.open = true;
    documentFields.reportValidity();
    return;
  }
  try {
    BNITZView.download(BNITZModel.validate(article));
    documentStatus.textContent = '';
  } catch (error) {
    documentStatus.textContent = `Could not export: ${error.message}`;
  }
});

documentFields.addEventListener('submit', event => event.preventDefault());
documentFields.addEventListener('input', ({target: {name, value}}) => {
  if (name === 'text') return;
  if (name !== 'title' && !value) delete article[name];
  else article[name] = name === 'year' ? Number(value) : value;
  renderHeading();
});
fields.text.addEventListener('beforeinput', event => {
  textSelection = event.inputType.startsWith('history') ? undefined
    : {start: fields.text.selectionStart, end: fields.text.selectionEnd, inputType: event.inputType};
});
fields.text.addEventListener('input', () => {
  // Textareas use LF line endings; adjust imported CRLF offsets before typing.
  for (const match of [...article.text.matchAll(/\r\n?/g)].reverse()) {
    const end = match.index + match[0].length;
    article = BNITZModel.editText(article, article.text.slice(0, match.index) + '\n' + article.text.slice(end),
      {start: match.index, end});
  }
  article = workspace.article = BNITZModel.editText(article, fields.text.value, textSelection);
  textSelection = undefined;
  pendingRange = null;
  redrawMap();
});

addPlanet.addEventListener('click', () => startDraft());
editPlanet.addEventListener('click', () => startDraft(article.spans.find(planet => planet.id === selectedId)));
cancelPlanet.addEventListener('click', () => {
  const trigger = draft.planet ? editPlanet : addPlanet;
  resetDraft();
  paintArticle();
  trigger.focus({preventScroll: true});
});

removePlanet.addEventListener('click', () => {
  const planet = article.spans.find(span => span.id === selectedId);
  if (planet.id === article.core && article.spans.length > 1) {
    editorStatus.textContent = 'Remove the other planets before removing the core.';
    return;
  }
  if (planet.id === article.core) article.core = null;
  article.spans = article.spans.filter(span => span !== planet)
    .map(span => span.parent === planet.id ? {...span, parent: planet.parent} : span);
  selectedId = null;
  editorStatus.textContent = '';
  redrawMap();
  addPlanet.focus({preventScroll: true});
});

// Keep the article selection intact until the click applies it.
highlightButton.addEventListener('pointerdown', event => event.preventDefault());
highlightButton.addEventListener('click', setHighlight);
clearHighlights.addEventListener('click', () => {
  draft.highlights = [];
  pendingRange = null;
  window.getSelection().removeAllRanges();
  paintArticle();
});

relation.addEventListener('change', () => showLegendRelation(relation.value));
editor.addEventListener('submit', event => {
  event.preventDefault();
  if (savePlanet.disabled) return;
  const trigger = draft.planet ? editPlanet : addPlanet;
  let planet = draft.planet;
  if (!planet) {
    let nextId = article.spans.length + 1;
    while (article.spans.some(span => span.id === `s${nextId}`)) nextId++;
    planet = {id: `s${nextId}`};
    article.spans.push(planet);
  }
  if (!article.core) article.core = planet.id;
  else if (planet.id !== article.core) {
    planet.parent = parent.value;
    planet.relation = relation.value;
  }
  if (draft.highlights !== draft.original) {
    planet.highlights = draft.highlights;
    const [first] = planet.highlights;
    if (first) {
      planet.start = first.start;
      planet.end = first.end;
    }
  }
  resetDraft();
  redrawMap();
  trigger.focus({preventScroll: true});
});

document.addEventListener('selectionchange', updateHighlightButton);
function updateTextSelection() {
  if (window.getSelection().isCollapsed) pendingRange = null;
  updateHighlightButton();
}
abstract.addEventListener('pointerup', updateTextSelection);
abstract.addEventListener('keyup', updateTextSelection);

function show() {
  const previous = active;
  active = location.hash === '#playground' ? workspace : library.get(location.hash);
  reading.hidden = !active;
  readings.hidden = Boolean(active);
  if (active === previous) return;
  selectedId = hovered = null;
  article = active?.article;
  resetDraft();
  const editing = active === workspace;
  editor.hidden = playgroundTools.hidden = !editing;
  if (editing) playgroundLink.setAttribute('aria-current', 'page');
  else playgroundLink.removeAttribute('aria-current');
  document.title = 'BNITZ';
  if (active) {
    renderHeading();
    if (editing) {
      for (const input of fields) input.value = article[input.name] ?? '';
      documentDetails.open = !article.text;
    }
    redrawMap();
    abstract.scrollTop = 0;
    title.focus({preventScroll: true});
  } else {
    previous?.row?.focus({preventScroll: true});
  }
  window.scrollTo(0, 0);
}

async function load() {
  const response = await fetch('/library.json');
  if (!response.ok) throw new Error('Could not load the reading list.');
  const {fromFolder, files} = await response.json();
  const entries = [];
  const errors = [];
  for (const {name, text} of files) {
    try {
      const article = BNITZModel.validate(JSON.parse(text));
      const author = typeof article.author === 'string' ? article.author.trim() : '';
      const year = Number.isInteger(article.year) && article.year > 0 && article.year < 10000 ? article.year : null;
      entries.push({name, article, author, year});
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  entries.sort((a, b) => (a.year ?? 10000) - (b.year ?? 10000) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    const row = document.createElement('a');
    row.className = 'reading';
    row.href = `#readings/${encodeURIComponent(entry.name)}`;
    row.append(textElement('span', entry.article.title), textElement('span', entry.author), textElement('time', entry.year ?? ''));
    entry.row = row;
    library.set(row.hash, entry);
    papers.append(row);
  }
  status.textContent = errors.join(' · ');
  status.hidden = !errors.length;
  if (!fromFolder && entries.length && !location.href.includes('#')) {
    history.replaceState(null, '', entries[0].row.hash);
  }
  if (location.hash === '#playground' && !workspace && entries.length) openRandomExample();
  show();
}

abstract.addEventListener('pointerover', event => {
  if (!draft && event.pointerType !== 'touch') hoverText(event.target.closest('mark'));
});
abstract.addEventListener('pointerleave', () => hoverText(null));
// Keep pointer selection from scrolling a focusable map or legend item into view.
for (const container of [map, document.querySelector('#legend')]) {
  container.addEventListener('pointerdown', event => {
    if (event.target.closest('.planet, button')) event.preventDefault();
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !draft && (selectedId || hovered)) selectPlanet(null);
});
window.addEventListener('hashchange', show);
show();
load().catch(error => {
  status.textContent = error.message;
  status.hidden = false;
});
