import {arxivPaperFromUrl} from './arxiv.mjs';
import config from './config.mjs';

const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const map = document.querySelector('#map');
const exportButton = document.querySelector('#export-map');
const {id: windowId} = await chrome.windows.getCurrent();
let current;

exportButton.addEventListener('click', () => {
  const article = current?.article;
  if (!article) return;
  const data = JSON.stringify(article, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
  const link = document.createElement('a');
  const paperId = arxivPaperFromUrl(article.source).id.replaceAll('/', '-');
  link.href = url;
  link.download = `bnitz-${paperId}.bnitz`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

async function mapAbstract({title, abstract, authors, affiliations, date}, arxivId, signal) {
  const response = await fetch(config.origin + '/v1/abstract-map', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({arxivId, title, text: abstract, authors, affiliations, date}),
    signal,
  });
  const result = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok) throw new Error(result?.error || 'BNITZ generation failed.');
  return BNITZModel.validate(result);
}

async function start() {
  const [tab] = await chrome.tabs.query({active: true, windowId});
  const requested = arxivPaperFromUrl(tab?.url);
  const tabKey = `${tab?.id}:${requested?.id}`;
  if (tabKey === current?.tabKey) return;
  current?.controller.abort();
  const controller = new AbortController();
  const {signal} = controller;
  current = {tabKey, controller};
  exportButton.disabled = true;
  map.hidden = true;
  map.replaceChildren();
  progress.hidden = !requested;
  status.textContent = '';

  if (!requested) {
    status.textContent = 'Open an arXiv HTML paper.';
    return;
  }

  try {
    const extracted = await chrome.tabs.sendMessage(tab.id, {type: 'bnitz-paper'}).catch(() => null);
    if (signal.aborted) return;
    if (!extracted?.abstract) throw new Error(extracted?.error ?? 'Reload this arXiv HTML page to connect BNITZ.');
    const paper = arxivPaperFromUrl(extracted.source);
    if (!paper?.version || paper.paperId !== requested.paperId || (requested.version && requested.id !== paper.id)) {
      throw new Error('Could not verify the arXiv HTML revision.');
    }
    const article = await mapAbstract(extracted, paper.id, AbortSignal.any([signal, AbortSignal.timeout(100000)]));
    if (signal.aborted) return;
    if (article.source !== paper.source || article.text !== extracted.abstract) {
      throw new Error('The map does not match this arXiv page.');
    }

    let selection = 0;
    BNITZView.map(map, article, async planet => {
      const request = ++selection;
      BNITZView.select(map, planet.id);
      status.textContent = '';
      const answer = await chrome.tabs.sendMessage(tab.id, {
        type: 'bnitz-highlight', bnitz: article, planetId: planet.id,
      }).catch(() => null);
      if (signal.aborted || request !== selection) return;
      if (!answer || answer.error) status.textContent = answer?.error ?? 'BNITZ could not connect to the page.';
    });
    current.article = article;
    exportButton.disabled = false;
    progress.hidden = true;
    map.hidden = false;
  } catch (error) {
    if (signal.aborted) return;
    progress.hidden = true;
    status.textContent = error.name === 'TimeoutError' ? 'Map generation timed out.' : error.message;
    current = null;
  }
}

chrome.tabs.onActivated.addListener(info => {
  if (info.windowId === windowId) start();
});
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (!tab.active || tab.windowId !== windowId) return;
  if (change.status === 'loading') {
    current?.controller.abort();
    current = null;
    exportButton.disabled = true;
    map.hidden = true;
  }
  if (change.status === 'complete') start();
});
start();
