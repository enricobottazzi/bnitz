import {arxivPaperFromUrl, bodyText} from './arxiv.mjs';
import config from './config.mjs';
import {consentKey, hasConsent} from './consent.mjs';

const privacy = document.querySelector('#privacy');
const agree = document.querySelector('#agree');
const privacyError = document.querySelector('#privacy-error');
const actions = document.querySelector('.panel-actions');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const map = document.querySelector('#map');
const exportButton = document.querySelector('#export-map');
const loadingTrack = progress.querySelector('.loading-track');
for (const [, slot, icon] of Object.values(BNITZModel.relations)) {
  const [x, y] = BNITZModel.relationDirection(slot);
  const satellite = new Image(18, 18);
  satellite.src = `../assets/${icon}.svg`;
  satellite.alt = '';
  satellite.style.left = `${50 + x * 50}%`;
  satellite.style.top = `${50 + y * 50}%`;
  loadingTrack.append(satellite);
}

const {id: windowId} = await chrome.windows.getCurrent();
let current;
let agreed = false;

agree.addEventListener('click', async () => {
  agree.disabled = true;
  privacyError.textContent = '';
  try {
    await chrome.storage.local.set({[consentKey]: true});
  } catch {
    privacyError.textContent = 'Could not save your choice. Please try again.';
  } finally {
    agree.disabled = false;
  }
});

exportButton.addEventListener('click', () => {
  const article = current?.article;
  if (!article) return;
  const paperId = article.arxivId.replaceAll('/', '-');
  BNITZView.download(article, `bnitz-${paperId}.bnitz`);
});

function elapsedSeconds(started) {
  return ((performance.now() - started) / 1000).toFixed(1);
}

function logPrefix(arxivId) {
  return `[BNITZ] [${arxivId}]`;
}

function logStepTimes(arxivId, response, hasBody, failed) {
  const prefix = logPrefix(arxivId);
  if (response.headers.get('BNITZ-Cache') === 'HIT') {
    console.info(`${prefix} Cache hit. Steps 2 and 3 skipped.`);
    return;
  }
  const timing = response.headers.get('Server-Timing') ?? '';
  const failedStep = failed ? (timing.includes('step3;dur=') ? 3 : 2) : null;
  const steps = [[2, 'abstract map'], [3, 'body highlighting']];
  for (const [step, label] of steps) {
    const milliseconds = new RegExp(`(?:^|,\\s*)step${step};dur=(\\d+)`).exec(timing)?.[1];
    if (milliseconds === undefined) continue;
    const stepFailed = step === failedStep;
    console[stepFailed ? 'warn' : 'info'](`${prefix} Step ${step} (${label}) ${stepFailed ? 'failed after' : 'took'} ${(Number(milliseconds) / 1000).toFixed(1)} s.`);
  }
  if (!failed && !hasBody) console.info(`${prefix} Step 3 skipped. The paper has no body blocks.`);
}

class WorkerResponseError extends Error {
  constructor(code, message) {
    super(`HTTP ${code}: ${message}`);
  }
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
      body: JSON.stringify({arxivId, title, abstract, authors, affiliations, date, body, includeDecisionNote: true}),
      signal,
    });
    const result = await response.json().catch(() => null);
    signal.throwIfAborted();
    const failed = !response.ok || Boolean(result?.error);
    logStepTimes(arxivId, response, body.length > 0, failed);
    if (failed) {
      const message = typeof result?.error === 'string' && result.error;
      throw new WorkerResponseError(response.status, message || 'BNITZ generation failed.');
    }
    const article = BNITZModel.validateArxiv(result?.map ?? result, {arxivId, abstract, body: bodyText(body)});
    if (typeof result?.decision_note === 'string' && result.decision_note.trim()) {
      console.info(`${logPrefix(arxivId)} Decision note:`, result.decision_note);
    }
    return {
      article,
      requestSeconds: elapsedSeconds(started),
      cached: response.headers.get('BNITZ-Cache') === 'HIT',
    };
  } finally {
    clearInterval(waiting);
  }
}

function clearPanel() {
  current?.controller.abort();
  current = null;
  exportButton.disabled = true;
  map.hidden = true;
  map.replaceChildren();
  progress.hidden = true;
  status.textContent = '';
}

async function start() {
  if (!agreed) return;
  const [tab] = await chrome.tabs.query({active: true, windowId});
  if (!agreed) return;
  if (tab?.status !== 'complete' || tab.pendingUrl) {
    clearPanel();
    return;
  }
  const requested = arxivPaperFromUrl(tab.url);
  const tabKey = `${tab.id}:${requested?.format ?? ''}/${requested?.id ?? ''}`;
  if (tabKey === current?.tabKey) return;
  clearPanel();
  const controller = new AbortController();
  const {signal} = controller;
  current = {tabKey, controller};

  if (!requested) {
    status.textContent = 'BNITZ works on arXiv HTML papers.';
    return;
  }
  if (requested.format !== 'html') {
    const link = document.createElement('a');
    link.href = `https://arxiv.org/html/${requested.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open HTML version';
    status.append(link);
    return;
  }

  progress.hidden = false;
  const started = performance.now();
  let prefix = logPrefix(requested.id);
  try {
    console.info(`${prefix} Reading paper…`);
    const extracted = await chrome.tabs.sendMessage(tab.id, {type: 'bnitz-paper'}).catch(() => null);
    signal.throwIfAborted();
    if (!extracted?.abstract) throw new Error(extracted?.error ?? 'Reload this arXiv HTML page to connect BNITZ.');
    const paper = arxivPaperFromUrl(extracted.source);
    if (paper?.format !== 'html' || !paper.version || paper.paperId !== requested.paperId || (requested.version && requested.id !== paper.id)) {
      throw new Error('Could not verify the arXiv HTML revision.');
    }
    prefix = logPrefix(paper.id);
    console.info(`${prefix} Paper read in ${elapsedSeconds(started)} s. Waiting for the map…`);
    const {article, requestSeconds, cached} = await mapPaper(
      extracted, paper.id, AbortSignal.any([signal, AbortSignal.timeout(190000)]),
    );
    signal.throwIfAborted();

    let selection = 0;
    BNITZView.map(map, {...article, text: extracted.abstract}, async planet => {
      const request = ++selection;
      BNITZView.select(map, planet.id);
      status.textContent = '';
      const answer = await chrome.tabs.sendMessage(tab.id, {
        type: 'bnitz-highlight', arxivId: article.arxivId, snapshotId: extracted.snapshotId, ranges: planet.highlights,
      }).catch(() => null);
      if (signal.aborted || request !== selection) return;
      if (!answer || answer.error) status.textContent = answer?.error ?? 'BNITZ could not connect to the page.';
    });
    current.article = article;
    exportButton.disabled = false;
    progress.hidden = true;
    map.hidden = false;
    console.info(`${prefix} Map ready in ${elapsedSeconds(started)} s (request: ${requestSeconds} s${cached ? ', cached' : ''}).`);
  } catch (error) {
    if (signal.aborted) return;
    progress.hidden = true;
    const message = error.name === 'TimeoutError' ? 'Map generation timed out.' : error.message;
    status.textContent = message;
    if (error instanceof WorkerResponseError) {
      const link = document.createElement('a');
      link.href = 'https://github.com/enricobottazzi/bnitz/blob/main/extension/ERRORS.md';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'ERRORS.md';
      status.append(' ', link);
    }
    console.warn(`${prefix} ${message} (${elapsedSeconds(started)} s)`);
    current = null;
  }
}

chrome.tabs.onActivated.addListener(info => {
  if (info.windowId === windowId) start();
});
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (!tab.active || tab.windowId !== windowId) return;
  if (change.status === 'loading') clearPanel();
  if (change.status === 'complete') start();
});

function showConsentState(granted) {
  agreed = granted;
  privacy.hidden = granted;
  actions.hidden = !granted;
  if (granted) {
    start();
  } else {
    clearPanel();
  }
}

chrome.storage.local.onChanged.addListener(changes => {
  if (changes[consentKey]) showConsentState(changes[consentKey].newValue === true);
});
try {
  showConsentState(await hasConsent());
} catch {
  showConsentState(false);
  privacyError.textContent = 'Could not read your saved choice. Please try again.';
}
