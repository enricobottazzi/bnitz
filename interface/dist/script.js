const readingsSection = document.querySelector('#readings');
const articles = [...document.querySelectorAll('[data-article]')];
let activeArticle = null;
let selectionOverlay = null;

function clearSelection() {
  if (selectionOverlay) {
    const {overlay, ink, visibility} = selectionOverlay;
    overlay.remove();
    if (visibility === null) ink.removeAttribute('visibility');
    else ink.setAttribute('visibility', visibility);
    selectionOverlay = null;
  }
  document.querySelectorAll('.map-element').forEach(element => {
    element.classList.remove('is-selected');
    element.setAttribute('aria-pressed', 'false');
  });
  document.querySelectorAll('.article-fragment').forEach(fragment => fragment.classList.remove('highlight-primary', 'highlight-secondary'));
}

function showSection() {
  const previous = activeArticle;
  activeArticle = articles.find(article => location.hash === `#readings/${article.dataset.article}`) || null;
  articles.forEach(article => { article.hidden = article !== activeArticle; });
  readingsSection.hidden = Boolean(activeArticle);
  document.title = activeArticle ? `BNITZ - ${activeArticle.querySelector('h1').textContent}` : 'BNITZ';
  if (activeArticle !== previous) {
    clearSelection();
    articles.forEach(article => { article.querySelector('.reader-text').scrollTop = 0; });
    if (activeArticle) activeArticle.querySelector('h1').focus({ preventScroll: true });
    else if (previous) {
      const link = [...readingsSection.querySelectorAll('a')].find(link => link.hash === `#readings/${previous.dataset.article}`);
      link?.focus({ preventScroll: true });
    }
  }
  window.scrollTo(0, 0);
}

function selectElement(element) {
  const selected = element.classList.contains('is-selected');
  clearSelection();
  if (selected) return;
  const ranges = JSON.parse(element.dataset.ranges);
  element.classList.add('is-selected');
  element.setAttribute('aria-pressed', 'true');
  const ink = element.querySelector('.map-ink'), svg = element.closest('svg');
  if (element.dataset.outline !== 'true' && ink && svg) {
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('class', 'map-selection-overlay');
    overlay.setAttribute('transform', element.getAttribute('transform') || '');
    overlay.setAttribute('pointer-events', 'none');
    overlay.setAttribute('aria-hidden', 'true');
    const copy = ink.cloneNode(true);
    copy.removeAttribute('id');
    copy.setAttribute('fill', '#deff00');
    copy.setAttribute('opacity', '1');
    overlay.append(copy);
    selectionOverlay = {overlay, ink, visibility: ink.getAttribute('visibility')};
    ink.setAttribute('visibility', 'hidden');
    svg.append(overlay);
  }
  const reader = element.closest('[data-article]').querySelector('.reader-text');
  let first = null;
  reader.querySelectorAll('.article-fragment').forEach(fragment => {
    const start = Number(fragment.dataset.start);
    const end = Number(fragment.dataset.end);
    const matches = ranges.filter(range => range.start < end && range.end > start);
    if (!matches.length) return;
    fragment.classList.add(matches.some(range => range.grade === 'primary') ? 'highlight-primary' : 'highlight-secondary');
    if (!first) first = fragment;
  });
  if (first) {
    reader.scrollTo({ top: Math.max(0, first.offsetTop - reader.clientHeight / 4), behavior: 'auto' });
    if (matchMedia('(max-width: 600px)').matches) reader.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
}

function pickMapElement(event) {
  const svg = event.target.closest('svg.reading-map');
  if (!svg) return null;
  const elements = [...new Set(document.elementsFromPoint(event.clientX, event.clientY)
    .map(node => node.closest('.map-element'))
    .filter(element => element && element.closest('svg') === svg))];
  const closed = elements.filter(element => element.dataset.connector !== 'true');
  // Prefer the actual surface over a neighboring shape's padded border target.
  const interiors = closed.filter(element => {
    const hit = element.querySelector?.('.map-hit');
    if (typeof DOMPoint === 'undefined' || typeof hit?.isPointInFill !== 'function' || typeof hit.getScreenCTM !== 'function') return false;
    const matrix = hit.getScreenCTM();
    return matrix ? hit.isPointInFill(new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())) : false;
  });
  const targets = interiors.length ? interiors : closed;
  let chosen = targets[0];
  while (chosen?.dataset.outline === 'true' && chosen.querySelector('.map-ink')?.getAttribute('fill') === 'none') {
    const outer = chosen.getBoundingClientRect();
    const nested = targets.slice(targets.indexOf(chosen) + 1).find(element => {
      const inner = element.getBoundingClientRect();
      return inner.width * inner.height < outer.width * outer.height;
    });
    if (!nested) break;
    chosen = nested;
  }
  return chosen || elements[0] || null;
}

document.addEventListener('click', event => {
  const element = pickMapElement(event);
  if (element) selectElement(element);
});
document.addEventListener('keydown', event => {
  const element = event.target.closest('.map-element');
  if (element && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    selectElement(element);
  } else if (event.key === 'Escape') clearSelection();
});
window.addEventListener('hashchange', showSection);
showSection();
