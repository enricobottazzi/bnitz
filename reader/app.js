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
  if (planet) showLegendRelation(planet.relation ?? 'nucleus');
  highlight();
  updateEditor();
  editorStatus.textContent = '';
  const first = abstract.querySelector('mark.highlighted');
  if (!first) return;
  abstract.scrollTop = Math.max(0, first.offsetTop - abstract.clientHeight / 4);
  if (editor.hidden && matchMedia('(max-width: 600px)').matches) abstract.scrollIntoView({block: 'start'});
}

function redrawMap() {
  if (article.nucleus) BNITZView.map(map, article, selectPlanet);
  else map.replaceChildren();
  paintArticle();
  updateEditor();
}

function selectPrompt(select) {
  const prompt = new Option(select.getAttribute('aria-label'), '', true, true);
  prompt.disabled = true;
  return prompt;
}

function configurePlanetSettings(planet) {
  const isNucleus = !article.nucleus || planet?.id === article.nucleus;
  if (isNucleus) {
    relation.replaceChildren(new Option('Nucleus', 'nucleus'));
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
  parent.value = planet?.parent ?? article.nucleus;
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
  const isNucleus = !article?.nucleus || draft?.planet?.id === article.nucleus;
  addPlanet.disabled = map.inert = editing;
  removePlanet.disabled = editPlanet.disabled = editing || !selectedId;
  clearHighlights.disabled = !hasHighlights;
  cancelPlanet.disabled = !editing;
  hint.style.visibility = editing ? 'visible' : '';
  relation.disabled = parent.disabled = isNucleus || !(draft?.planet || hasHighlights);
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
  updateEditor();
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
  updateEditor();
}

playground.setAttribute('aria-controls', editor.id);
playground.addEventListener('click', event => {
  event.preventDefault();
  const opening = editor.hidden;
  if (opening && article === active.article) article = structuredClone(article);
  editor.hidden = !opening;
  playground.setAttribute('aria-expanded', String(opening));
  if (!opening && draft) {
    resetDraft();
    paintArticle();
  }
  updateEditor();
});

addPlanet.addEventListener('click', () => startDraft());
editPlanet.addEventListener('click', () => startDraft(article.spans.find(planet => planet.id === selectedId)));
cancelPlanet.addEventListener('click', () => {
  const trigger = draft.planet ? editPlanet : addPlanet;
  resetDraft();
  paintArticle();
  updateEditor();
  trigger.focus({preventScroll: true});
});

removePlanet.addEventListener('click', () => {
  const planet = article.spans.find(span => span.id === selectedId);
  if (planet.id === article.nucleus && article.spans.length > 1) {
    editorStatus.textContent = 'Remove the other planets before removing the nucleus.';
    return;
  }
  if (planet.id === article.nucleus) article.nucleus = null;
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
  updateEditor();
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
  if (!article.nucleus) article.nucleus = planet.id;
  else if (planet.id !== article.nucleus) {
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
  active = library.get(location.hash);
  reading.hidden = !active;
  readings.hidden = Boolean(active);
  if (active === previous) return;
  selectedId = hovered = null;
  article = active?.article;
  resetDraft();
  editor.hidden = true;
  playground.setAttribute('aria-expanded', 'false');
  document.title = active ? `BNITZ - ${active.article.title}` : 'BNITZ';
  if (active) {
    const {author, year} = active;
    title.textContent = article.title;
    abstract.setAttribute('aria-label', `${article.title} article text`);
    playground.href = active.row.hash;
    const details = [author, year && textElement('time', year), sourceLink(article.source), playground].filter(Boolean);
    metadata.replaceChildren(...details.flatMap((part, index) => index ? [' · ', part] : [part]));
    redrawMap();
    abstract.scrollTop = 0;
    title.focus({preventScroll: true});
  } else {
    previous?.row.focus({preventScroll: true});
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
  window.addEventListener('hashchange', show);
  show();
}

abstract.addEventListener('pointerover', event => {
  if (!draft && event.pointerType !== 'touch') hoverText(event.target.closest('mark'));
});
abstract.addEventListener('pointerleave', () => hoverText(null));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !draft && (selectedId || hovered)) selectPlanet(null);
});
load().catch(error => {
  status.textContent = error.message;
  status.hidden = false;
});
