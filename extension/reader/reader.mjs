import {arxivId} from './arxiv.mjs';
import {strToU8, zipSync} from '../vendor/fflate.mjs';

const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const orbit = document.querySelector('#loading-orbit');
const map = document.querySelector('#map');
const exportButton = document.querySelector('#export-map');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let current;

exportButton.addEventListener('click', () => {
  if (!current?.files) return;
  const {map, anchors} = current.files;
  const archive = zipSync({
    'map.bnitz': strToU8(JSON.stringify(map, null, 2)),
    'pdf-anchors.json': strToU8(JSON.stringify(anchors, null, 2)),
  });
  const url = URL.createObjectURL(new Blob([archive], {type: 'application/zip'}));
  const link = document.createElement('a');
  const paperId = map.source.split('/abs/').at(-1).replaceAll('/', '-');
  link.href = url;
  link.download = `bnitz-${paperId}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

async function waitForMap(tabId, id, attempts, signal) {
  for (let i = 0; i < attempts && !signal.aborted; i++) {
    const result = await chrome.runtime.sendMessage({type: 'bnitz-map', tabId, id}).catch(() => null);
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
  exportButton.disabled = true;
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
    let result = await waitForMap(tab.id, id, 8, signal);
    if ((!result || (result.map && !result.anchors)) && !signal.aborted) {
      // An already-open PDF may still be using Chrome's previous viewer.
      await chrome.tabs.reload(tab.id);
      result = await waitForMap(tab.id, id, 48, signal);
    }
    if (signal.aborted) return;
    if (!result?.map || !result.anchors) throw new Error(result?.error ?? 'BNITZ could not connect to the PDF.');

    const message = data => chrome.runtime.sendMessage({tabId: tab.id, id, ...data}).catch(() => null);
    let selection = 0;
    BNITZView.map(map, result.map, async planet => {
      const request = ++selection;
      const selected = await message({type: 'bnitz-highlight', ranges: BNITZModel.highlights(planet)});
      if (selected && !signal.aborted && request === selection) BNITZView.select(map, planet.id);
    });
    current.files = result;
    exportButton.disabled = false;
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
