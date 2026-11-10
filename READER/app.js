const {textElement} = BNITZView;
const readings = document.querySelector('#readings');
const papers = document.querySelector('#papers');
const reading = document.querySelector('#reading');
const title = document.querySelector('#title');
const metadata = document.querySelector('#metadata');
const abstract = document.querySelector('#abstract');
const map = document.querySelector('#map');
const showLegendRelation = BNITZView.legend(document.querySelector('#legend'));
const status = document.querySelector('#status');
const library = new Map();
const links = new Map();
let active;
let selectedId;
let hovered;

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

function paintArticle(article) {
  links.clear();
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
      BNITZView.paintText(paragraph, part, local, (mark, matches) => links.set(mark, matches), {typeset: true});
      fragment.append(paragraph);
    }
    offset = end;
  }
  abstract.replaceChildren(fragment);
}

function highlight() {
  const ids = new Set(hovered ? links.get(hovered).map(range => range.planetId) : selectedId ? [selectedId] : []);
  BNITZView.select(map, ...ids);
  for (const [mark, ranges] of links) {
    const matches = ranges.filter(range => ids.has(range.planetId));
    mark.className = matches.some(range => range.grade === 'strong') ? 'strong' : matches.length ? 'soft' : '';
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
  const first = abstract.querySelector('mark.strong, mark.soft');
  if (!first) return;
  abstract.scrollTop = Math.max(0, first.offsetTop - abstract.clientHeight / 4);
  if (matchMedia('(max-width: 600px)').matches) abstract.scrollIntoView({block: 'start'});
}

function show() {
  const previous = active;
  active = library.get(location.hash);
  reading.hidden = !active;
  readings.hidden = Boolean(active);
  if (active === previous) return;
  selectedId = hovered = null;
  document.title = active ? `BNITZ - ${active.article.title}` : 'BNITZ';
  if (active) {
    const {article, author, year} = active;
    title.textContent = article.title;
    abstract.setAttribute('aria-label', `${article.title} article text`);
    const details = [author, year && textElement('time', year), sourceLink(article.source)].filter(Boolean);
    metadata.replaceChildren(...details.flatMap((part, index) => index ? [' · ', part] : [part]));
    metadata.hidden = !details.length;
    paintArticle(article);
    abstract.scrollTop = 0;
    BNITZView.map(map, article, selectPlanet);
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
  if (event.pointerType !== 'touch') hoverText(event.target.closest('mark'));
});
abstract.addEventListener('pointerleave', () => hoverText(null));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (selectedId || hovered)) selectPlanet(null);
});
load().catch(error => {
  status.textContent = error.message;
  status.hidden = false;
});
