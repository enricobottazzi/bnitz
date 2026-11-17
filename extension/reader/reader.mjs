import {arxivPaperFromUrl, bodyText} from './arxiv.mjs';
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
  const paperId = article.arxivId.replaceAll('/', '-');
  link.href = url;
  link.download = `bnitz-${paperId}.bnitz`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

function elapsedSeconds(started) {
  return ((performance.now() - started) / 1000).toFixed(1);
}

function logPrefix(arxivId) {
  return `[BNITZ] [${arxivId}]`;
}

function logStepTimes(arxivId, response, hasBody, bodyFailed) {
  const prefix = logPrefix(arxivId);
  if (response.headers.get('BNITZ-Cache') === 'HIT') {
    console.info(`${prefix} Cache hit. Steps 2 and 3 skipped.`);
    return;
  }
  const timing = response.headers.get('Server-Timing') ?? '';
  const steps = [[2, 'abstract map', !response.ok], [3, 'body highlighting', bodyFailed]];
  for (const [step, label, failed] of steps) {
    const milliseconds = new RegExp(`(?:^|,\\s*)step${step};dur=(\\d+)`).exec(timing)?.[1];
    if (milliseconds === undefined) continue;
    console[failed ? 'warn' : 'info'](`${prefix} Step ${step} (${label}) ${failed ? 'failed after' : 'took'} ${(Number(milliseconds) / 1000).toFixed(1)} s.`);
  }
  if (response.ok && !hasBody) console.info(`${prefix} Step 3 skipped. The paper has no body blocks.`);
}

async function mapPaper({title, abstract, authors, affiliations, date, body}, arxivId, signal) {
  const started = performance.now();
  const waiting = setInterval(() => {
    console.info(`${logPrefix(arxivId)} Still waiting for the map (${elapsedSeconds(started)} s).`);
  }, 5000);
  try {
    const response = await fetch(config.origin + '/v1/paper-map', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({arxivId, title, abstract, authors, affiliations, date, body}),
      signal,
    });
    const result = await response.json().catch(() => null);
    signal.throwIfAborted();
    logStepTimes(arxivId, response, body.length > 0, Boolean(result?.map && result?.error));
    if (!response.ok) throw new Error(result?.error || 'BNITZ generation failed.');
    return {
      article: BNITZModel.validateArxiv(result?.map ?? result, {arxivId, abstract, body: bodyText(body)}),
      warning: result?.error ?? '',
      requestSeconds: elapsedSeconds(started),
      cached: response.headers.get('BNITZ-Cache') === 'HIT',
    };
  } finally {
    clearInterval(waiting);
  }
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

  const started = performance.now();
  let prefix = logPrefix(requested.id);
  try {
    console.info(`${prefix} Reading paper…`);
    const extracted = await chrome.tabs.sendMessage(tab.id, {type: 'bnitz-paper'}).catch(() => null);
    signal.throwIfAborted();
    if (!extracted?.abstract) throw new Error(extracted?.error ?? 'Reload this arXiv HTML page to connect BNITZ.');
    const paper = arxivPaperFromUrl(extracted.source);
    if (!paper?.version || paper.paperId !== requested.paperId || (requested.version && requested.id !== paper.id)) {
      throw new Error('Could not verify the arXiv HTML revision.');
    }
    prefix = logPrefix(paper.id);
    console.info(`${prefix} Paper read in ${elapsedSeconds(started)} s. Waiting for the map…`);
    const {article, warning, requestSeconds, cached} = await mapPaper(
      extracted, paper.id, AbortSignal.any([signal, AbortSignal.timeout(190000)]),
    );
    signal.throwIfAborted();

    let selection = 0;
    BNITZView.map(map, {...article, text: extracted.abstract}, async planet => {
      const request = ++selection;
      BNITZView.select(map, planet.id);
      status.textContent = warning;
      const answer = await chrome.tabs.sendMessage(tab.id, {
        type: 'bnitz-highlight', arxivId: article.arxivId, snapshotId: extracted.snapshotId, ranges: planet.highlights,
      }).catch(() => null);
      if (signal.aborted || request !== selection) return;
      if (!answer || answer.error) status.textContent = answer?.error ?? 'BNITZ could not connect to the page.';
    });
    current.article = warning ? null : article;
    exportButton.disabled = Boolean(warning);
    status.textContent = warning;
    progress.hidden = true;
    map.hidden = false;
    console.info(`${prefix} Map ready in ${elapsedSeconds(started)} s (request: ${requestSeconds} s${cached ? ', cached' : ''}).`);
  } catch (error) {
    if (signal.aborted) return;
    progress.hidden = true;
    status.textContent = error.name === 'TimeoutError' ? 'Map generation timed out.' : error.message;
    console.warn(`${prefix} ${status.textContent} (${elapsedSeconds(started)} s)`);
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
