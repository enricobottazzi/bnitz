const readingsSection = document.querySelector('#readings');
const articles = [...document.querySelectorAll('[data-article]')];
let activeArticle = null;

function clearSelection() {
  document.querySelectorAll('.map-element').forEach(element => {
    element.classList.remove('is-selected');
    element.setAttribute('aria-pressed', 'false');
  });
  document.querySelectorAll('.article-passage').forEach(passage => passage.classList.remove('is-highlighted'));
}

function showSection() {
  const previous = activeArticle;
  activeArticle = articles.find(article => location.hash === `#readings/${article.dataset.article}`) || null;
  articles.forEach(article => { article.hidden = article !== activeArticle; });
  readingsSection.hidden = Boolean(activeArticle);
  document.title = activeArticle ? `${activeArticle.querySelector('h1').textContent} — BNITZ` : 'BNITZ';
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
  const passages = element.dataset.passages.split(' ').map(id => document.getElementById(id));
  element.classList.add('is-selected');
  element.setAttribute('aria-pressed', 'true');
  passages.forEach(passage => passage.classList.add('is-highlighted'));
  const reader = element.closest('[data-article]').querySelector('.reader-text');
  const passage = passages[0];
  reader.scrollTo({ top: passage.offsetTop - (reader.clientHeight - Math.min(passage.offsetHeight, reader.clientHeight)) / 2, behavior: 'auto' });
  if (matchMedia('(max-width: 600px)').matches) reader.scrollIntoView({ block: 'start', behavior: 'auto' });
}

document.addEventListener('click', event => {
  const element = event.target.closest('.map-element');
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
