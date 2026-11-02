function showSection() {
  const route = location.hash.slice(1);
  const isReader = route === 'readings/the-bitter-lesson';
  const active = isReader ? 'reader' : route;
  for (const section of document.querySelectorAll('main > section')) {
    section.hidden = section.id !== active;
  }
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === location.hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('main').classList.toggle('is-reader', isReader);
  document.title = isReader ? 'The Bitter Lesson — BNITZ' : active === 'readings' || active === 'about' ? `${active} — BNITZ` : 'BNITZ';
  if (!isReader) {
    clearSelection();
    document.querySelector('.reader-text').scrollTop = 0;
  }
  window.scrollTo(0, 0);
}

function clearSelection() {
  for (const element of document.querySelectorAll('.map-element')) {
    element.classList.remove('is-selected');
    element.setAttribute('aria-pressed', 'false');
  }
  for (const passage of document.querySelectorAll('.article-passage')) {
    passage.classList.remove('is-highlighted');
  }
}

function selectElement(element) {
  const wasSelected = element.classList.contains('is-selected');
  clearSelection();
  if (wasSelected) return;
  const passage = document.getElementById(element.dataset.passage);
  if (!passage) return;
  element.classList.add('is-selected');
  element.setAttribute('aria-pressed', 'true');
  passage.classList.add('is-highlighted');
  const reader = document.querySelector('.reader-text');
  reader.scrollTo({ top: passage.offsetTop - (reader.clientHeight - Math.min(passage.offsetHeight, reader.clientHeight)) / 2, behavior: 'auto' });
  if (matchMedia('(max-width: 600px)').matches) reader.scrollIntoView({ block: 'start', behavior: 'auto' });
}

const map = document.querySelector('.reading-map');
for (const element of map.querySelectorAll('.map-element')) {
  element.setAttribute('aria-controls', element.dataset.passage);
}
map.addEventListener('click', event => {
  const element = event.target.closest('.map-element');
  if (element) selectElement(element);
});
map.addEventListener('keydown', event => {
  const element = event.target.closest('.map-element');
  if (element && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    selectElement(element);
  } else if (event.key === 'Escape') clearSelection();
});
window.addEventListener('hashchange', showSection);
showSection();
