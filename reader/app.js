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
const aboutLink = document.querySelector('#about-link');
const playgroundLink = document.querySelector('#playground-link');
const exportDocument = document.querySelector('#export-document');
const arxivImport = document.querySelector('#arxiv-import');
const arxivUrl = document.querySelector('#arxiv-url');
const arxivStatus = arxivImport.querySelector('[role="status"]');
const documentStatus = document.querySelector('#document-status');
const editor = document.querySelector('#planet-editor');
const addPlanet = document.querySelector('#add-planet');
const planetMenu = document.querySelector('#planet-menu');
const removePlanet = document.querySelector('#remove-planet');
const undoPlanet = document.querySelector('#undo-planet');
const newCore = document.querySelector('#new-core');
const mapRoute = '#playground/map';
const pages = new Map([[playgroundLink.hash, {row: playgroundLink}]]);
const links = new Map();
const segments = [];
let active;
let article;
let selectedId;
let hovered;
let workspace;
let importRequest;

let showLegendRelation;

async function loadLegend() {
  const legend = document.querySelector('#legend');
  try {
    const response = await fetch('/RULES.md', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Could not load RULES.md.');
    const definitions = BNITZModel.parseLegendDefinitions(await response.text());
    showLegendRelation = BNITZView.legend(legend, definitions);
  } catch (error) {
    legend.classList.add('status');
    legend.textContent = error.message;
  }
}

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
  title.textContent = article.title;
  document.title = `BNITZ - ${editing ? 'Playground' : article.title}`;
  abstract.setAttribute('aria-label', article.title ? `${article.title} article text` : 'Article text');
  const details = [
    article.author,
    article.year && textElement('time', article.year),
    sourceLink(article.source),
    !editing && playground].filter(Boolean);
  metadata.replaceChildren(...details.flatMap((part, index) => index ? [' · ', part] : [part]));
}

function openWorkspace(document) {
  workspace = {article: document, undo: []};
  pages.set(mapRoute, workspace);
  location.hash = mapRoute;
}

function paintArticle() {
  const scrollTop = abstract.scrollTop;
  links.clear();
  segments.length = 0;
  hovered = null;
  const ranges = article.spans.flatMap(planet =>
    BNITZModel.highlights(planet).map(range => ({...range, planetId: planet.id})));
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
    mark.classList.toggle('highlighted', ranges.some(range => ids.has(range.planetId)));
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
  if (planet) showLegendRelation?.(planet.relation ?? 'core');
  highlight();
  updateEditor();
}

function selectedPlanet() {
  return article.spans.find(planet => planet.id === selectedId);
}

function redrawMap() {
  planetMenu.hidePopover();
  if (article.core) {
    BNITZView.map(map, article, selectPlanet);
    for (const planet of article.spans) {
      if (planet.highlights?.length === 0) {
        map.querySelector(`[data-id="${CSS.escape(planet.id)}"]`).setAttribute('aria-label', BNITZModel.label(planet));
      }
    }
  } else {
    newCore.hidden = !article.text.trim();
    map.replaceChildren(newCore);
  }
  paintArticle();
}

function updateEditor() {
  exportDocument.disabled = !article.core;
  addPlanet.disabled = !selectedId;
  const hasChildren = selectedId != null && article.spans.some(span => span.parent === selectedId);
  removePlanet.disabled = !selectedId || hasChildren;
  removePlanet.ariaDescription = hasChildren ? 'Delete the child planets first.' : null;
  undoPlanet.disabled = !workspace?.undo.length;
}

function focusPlanet() {
  map.querySelector('[aria-pressed="true"], #new-core')?.focus({preventScroll: true});
}

function editMap(spans, core, selection) {
  workspace.undo.push({spans: article.spans, core: article.core, selection: selectedId});
  article.spans = spans;
  article.core = core;
  selectedId = selection;
  redrawMap();
  const planet = selectedPlanet();
  showLegendRelation?.(planet?.relation ?? 'core');
}

function addChild(relation) {
  const parent = selectedPlanet();
  let n = article.spans.length + 1;
  while (article.spans.some(planet => planet.id === `s${n}`)) n++;
  const planet = {id: `s${n}`, start: parent?.start ?? 0, end: parent?.end ?? article.text.length, highlights: []};
  if (parent) Object.assign(planet, {parent: parent.id, relation});
  editMap([...article.spans, planet], article.core ?? planet.id, planet.id);
  focusPlanet();
}

function toggleTextHighlight() {
  if (active !== workspace || !selectedId || planetMenu.matches(':popover-open')) return;
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!abstract.contains(selection.anchorNode)) return;
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
  const planet = selectedPlanet();
  const edited = BNITZPlayground.toggleHighlight(article.text, planet, {start: first, end: last});
  if (edited === planet) return;
  selection.removeAllRanges();
  editMap(article.spans.map(span => span === planet ? edited : span), article.core, selectedId);
}

playground.href = mapRoute;
playground.addEventListener('click', event => {
  event.preventDefault();
  openWorkspace(structuredClone(article));
});

function cancelImport() {
  importRequest?.abort();
  arxivStatus.classList.remove('loading');
  arxivStatus.textContent = '';
}

arxivUrl.addEventListener('input', event => {
  cancelImport();
  if (event.inputType === 'insertFromPaste') arxivImport.requestSubmit();
});
arxivImport.addEventListener('submit', async event => {
  event.preventDefault();
  cancelImport();
  const url = arxivUrl.value.trim();
  if (!/^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/abs\/\S+$/i.test(url)) {
    arxivStatus.textContent = 'Enter an arXiv abstract link like https://arxiv.org/abs/1706.03762';
    return;
  }
  const request = new AbortController();
  importRequest = request;
  arxivStatus.classList.add('loading');
  arxivStatus.textContent = 'Loading…';
  const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 2000));
  try {
    const query = new URLSearchParams({url});
    const response = await fetch(`/arxiv?${query}`, {signal: request.signal});
    const paper = await response.json();
    if (!response.ok) throw new Error(paper.error || 'Could not load the paper.');
    await minimumLoadingTime;
    if (request.signal.aborted || location.hash !== playgroundLink.hash) return;
    document.querySelector('.reader-legend').open = false;
    const nucleus = {id: 's1', start: 0, end: paper.text.length, highlights: []};
    openWorkspace({...paper, version: 3, core: nucleus.id, spans: [nucleus]});
  } catch (error) {
    await minimumLoadingTime;
    if (!request.signal.aborted) {
      arxivStatus.classList.remove('loading');
      arxivStatus.textContent = error.message;
    }
  }
});

exportDocument.addEventListener('click', () => {
  try {
    BNITZView.download(BNITZModel.validate(article), BNITZPlayground.filename(article.title));
    documentStatus.textContent = '';
  } catch (error) {
    documentStatus.textContent = `Could not export: ${error.message}`;
  }
});

newCore.addEventListener('click', () => addChild());
for (const [key, [name, , icon]] of Object.entries(BNITZModel.relations)) {
  const option = textElement('button', name);
  option.type = 'button';
  option.setAttribute('role', 'menuitem');
  option.tabIndex = -1;
  const symbol = new Image(18, 18);
  symbol.src = `/assets/${icon}.svg?v=0.0.6`;
  symbol.alt = '';
  option.prepend(symbol);
  option.addEventListener('click', () => addChild(key));
  planetMenu.append(option);
}

addPlanet.addEventListener('click', event => {
  planetMenu.firstElementChild.autofocus = event.detail === 0;
});
addPlanet.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    addPlanet.click();
  }
});
planetMenu.addEventListener('keydown', event => {
  const item = event.target;
  const first = planetMenu.firstElementChild;
  const last = planetMenu.lastElementChild;
  const next = {
    ArrowDown: item.nextElementSibling ?? first,
    ArrowUp: item.previousElementSibling ?? last,
    Home: first,
    End: last,
  }[event.key];
  if (next) {
    event.preventDefault();
    next.focus();
  } else if (event.key === 'Tab') planetMenu.hidePopover();
});

removePlanet.addEventListener('click', () => {
  const planet = selectedPlanet();
  const remaining = article.spans.filter(span => span !== planet);
  editMap(remaining, planet.id === article.core ? null : article.core, null);
  undoPlanet.focus({preventScroll: true});
});

undoPlanet.addEventListener('click', () => {
  const {spans, core, selection} = workspace.undo.pop();
  article.spans = spans;
  article.core = core;
  selectedId = selection;
  redrawMap();
  showLegendRelation?.(selectedPlanet()?.relation ?? 'core');
  focusPlanet();
});

abstract.addEventListener('pointerdown', event => {
  // Keep the release when a highlight drag ends beyond the last line.
  if (active === workspace && selectedId && event.button === 0 && event.pointerType !== 'touch') {
    abstract.setPointerCapture(event.pointerId);
  }
});
abstract.addEventListener('pointerup', event => {
  if (event.button === 0 && event.pointerType !== 'touch') toggleTextHighlight();
});
abstract.addEventListener('touchend', () => requestAnimationFrame(toggleTextHighlight), {passive: true});
abstract.addEventListener('keyup', event => {
  if (event.key === 'Shift') toggleTextHighlight();
});

function show() {
  const previous = active;
  if (location.hash === mapRoute && !workspace) history.replaceState(null, '', playgroundLink.hash);
  active = pages.get(location.hash);
  if (active === previous) return;
  const importing = location.hash === playgroundLink.hash;
  cancelImport();
  arxivImport.reset();
  arxivImport.hidden = !importing;
  article = active?.article;
  reading.hidden = !article;
  readings.hidden = Boolean(active);
  planetMenu.hidePopover();
  const editing = Boolean(active && active === workspace);
  selectedId = editing ? article.core : null;
  hovered = null;
  editor.hidden = !editing;
  documentStatus.textContent = '';
  if (active && location.hash === aboutLink.hash) aboutLink.setAttribute('aria-current', 'page');
  else aboutLink.removeAttribute('aria-current');
  if (importing || editing) playgroundLink.setAttribute('aria-current', 'page');
  else playgroundLink.removeAttribute('aria-current');
  document.title = 'BNITZ';
  if (importing) {
    document.title = 'BNITZ - Playground';
    arxivUrl.focus({preventScroll: true});
  } else if (article) {
    renderHeading();
    redrawMap();
    if (editing) showLegendRelation?.('core');
    abstract.scrollTop = 0;
    title.focus({preventScroll: true});
  } else {
    previous?.row?.focus({preventScroll: true});
  }
  window.scrollTo(0, 0);
}

async function load() {
  const [response] = await Promise.all([fetch('/library.json'), loadLegend()]);
  if (!response.ok) throw new Error('Could not load the reading list.');
  const {fromFolder, files} = await response.json();
  const entries = [];
  const errors = [];
  try {
    const response = await fetch('/about.bnitz');
    if (!response.ok) throw new Error('Could not load the About article.');
    pages.set(aboutLink.hash, {article: BNITZModel.validate(await response.json()), row: aboutLink});
  } catch (error) {
    errors.push(error.message);
  }
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
    pages.set(row.hash, entry);
    papers.append(row);
  }
  status.textContent = errors.join(' · ');
  status.hidden = !errors.length;
  if (!fromFolder && entries.length && !location.href.includes('#')) {
    history.replaceState(null, '', entries[0].row.hash);
  }
  show();
}

abstract.addEventListener('pointerover', event => {
  if (event.pointerType !== 'touch' && !(active === workspace && selectedId)) hoverText(event.target.closest('mark'));
});
abstract.addEventListener('pointerleave', () => hoverText(null));
// Keep pointer selection from scrolling a focusable map or legend item into view.
for (const container of [map, document.querySelector('#legend')]) {
  container.addEventListener('pointerdown', event => {
    if (event.target.closest('.planet, button')) event.preventDefault();
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector(':popover-open') && (selectedId || hovered)) selectPlanet(null);
});
window.addEventListener('hashchange', show);
show();
load().catch(error => {
  status.textContent = error.message;
  status.hidden = false;
});
