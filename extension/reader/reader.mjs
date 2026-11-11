import {arxivId} from './arxiv.mjs';
import {generateMap} from './generate.mjs';

const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const orbit = document.querySelector('#loading-orbit');
const map = document.querySelector('#map');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let current;

async function waitForAbstract(tabId, id, attempts, signal) {
  for (let i = 0; i < attempts && !signal.aborted; i++) {
    const result = await chrome.runtime.sendMessage({type: 'bnitz-abstract', tabId, id}).catch(() => null);
    if (result) return result;
    await delay(250);
  }
  return null;
}

async function start() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const id = arxivId(tab?.url);
  const tabKey = `${tab?.id}:${id}`;
  if (tabKey === current?.tabKey) return;
  current?.controller.abort();
  const controller = new AbortController();
  const {signal} = controller;
  current = {tabKey, controller};
  map.hidden = true;
  map.replaceChildren();
  progress.hidden = false;
  orbit.hidden = !id;
  status.textContent = '';

  if (!id) {
    status.textContent = 'Open an arXiv PDF.';
    return;
  }

  try {
    let result = await waitForAbstract(tab.id, id, 8, signal);
    if (!result && !signal.aborted) {
      // An already-open PDF may still be using Chrome's previous viewer.
      await chrome.tabs.reload(tab.id);
      result = await waitForAbstract(tab.id, id, 48, signal);
    }
    if (signal.aborted) return;
    if (!result?.article) throw new Error(result?.error ?? 'BNITZ could not connect to the PDF.');

    const key = await fetch('./local-key', {signal});
    if (!key.ok) throw new Error('The local BNITZ build is missing its OpenRouter key.');
    const article = await generateMap(result.article, (await key.text()).trim(), signal);
    if (signal.aborted) return;
    BNITZView.map(map, article, async planet => {
      const selected = await chrome.runtime.sendMessage({
        type: 'bnitz-highlight', tabId: tab.id, id, ranges: BNITZModel.highlights(planet),
      }).catch(() => false);
      if (selected && !signal.aborted) BNITZView.select(map, planet.id);
    });
    progress.hidden = true;
    map.hidden = false;
  } catch (error) {
    if (signal.aborted) return;
    orbit.hidden = true;
    status.textContent = error.name === 'TimeoutError' ? 'Map generation timed out.' : error.message;
    current = null;
  }
}

chrome.tabs.onActivated.addListener(start);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && change.url) start();
});
start();
