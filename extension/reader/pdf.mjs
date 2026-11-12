import * as pdfjs from '../pdfjs/pdf.min.mjs';
import {arxivId, arxivPaper, loadArxivRecord} from './arxiv.mjs';
import {overlaps} from './cache-entry.mjs';
import {loadPaperMap} from './paper.mjs';

const asset = path => new URL(`../pdfjs/${path}`, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
const markerTrack = document.querySelector('#highlight-markers');

function addPageHighlights(layer, spans, ranges, marks) {
  // PDF.js may remove presentation roles when linking annotations to text.
  const nodes = [...layer.querySelectorAll('span')].map(span => span.firstChild)
    .filter(node => node?.nodeType === Node.TEXT_NODE);
  for (const span of spans) {
    const node = nodes[span.index];
    if (node?.textContent !== span.text) continue;
    for (const {start, end, grade} of ranges) {
      const from = Math.max(start, span.start);
      const to = Math.min(end, span.end);
      if (from >= to || !Object.hasOwn(marks, grade)) continue;
      const range = new Range();
      range.setStart(node, span.nodeOffset + from - span.start);
      range.setEnd(node, span.nodeOffset + to - span.start);
      marks[grade].add(range);
    }
  }
}

function renderMarkers(viewer, targets) {
  const {container} = viewer;
  markerTrack.style.right = `${Math.max(10, container.offsetWidth - container.clientWidth)}px`;
  const origin = container.getBoundingClientRect().top - container.scrollTop;
  const markers = [];
  for (const target of targets) {
    const page = viewer.getPageView(target.pageNumber - 1);
    if (!page) continue;
    const [, y] = page.viewport.convertToViewportPoint(target.x, target.y);
    const offset = page.div.getBoundingClientRect().top + page.div.clientTop + y - origin;
    const marker = document.createElement('span');
    marker.style.top = `${100 * Math.min(1, Math.max(0, offset / container.scrollHeight))}%`;
    markers.push(marker);
  }
  markerTrack.replaceChildren(...markers);
}

async function loadViewer(pdfUrl) {
  const response = await fetch(pdfUrl, {signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error('Could not load the arXiv PDF.');
  const data = new Uint8Array(await response.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data, useWasm: false, cMapUrl: asset('cmaps/'),
    standardFontDataUrl: asset('standard_fonts/'), wasmUrl: asset('wasm/'),
  }).promise;
  globalThis.pdfjsLib = pdfjs;
  const {EventBus, PDFLinkService, PDFViewer} = await import('../pdfjs/pdf_viewer.mjs');
  const eventBus = new EventBus();
  const linkService = new PDFLinkService({eventBus});
  const container = document.querySelector('#paper');
  const viewer = new PDFViewer({
    container, viewer: document.querySelector('#viewer'),
    eventBus, linkService, imageResourcesPath: asset('images/'),
  });
  linkService.setViewer(viewer);
  linkService.setDocument(doc);
  eventBus.on('pagesinit', () => {
    const fitPage = () => { viewer.currentScaleValue = 'page-width'; };
    fitPage();
    new ResizeObserver(fitPage).observe(container);
  });
  viewer.setDocument(doc);
  return {doc, viewer, eventBus};
}

async function start() {
  const handler = chrome.mimeHandler;
  const {streamUrl, originalUrl, tabId} = await handler.getStreamInfo();
  const requested = arxivPaper(arxivId(originalUrl));
  if (!requested) return handler.abortAndFallbackToNativeHandler();

  const resolution = requested.version ? Promise.resolve({paper: requested}) :
    loadArxivRecord(requested).catch(() => ({paper: requested}));
  const loading = resolution.then(({paper}) => loadViewer(paper.id === requested.id ? streamUrl : paper.pdf));
  let entry;
  const getEntry = () => entry ??= Promise.all([loading, resolution])
    .then(([{doc}, {paper, article}]) => loadPaperMap(doc, paper, article, pdfjs.version))
    .catch(error => {
      entry = null;
      throw error;
    });

  let selected;
  function paintHighlights(viewer) {
    const marks = {strong: new Highlight(), soft: new Highlight()};
    marks.strong.priority = 1;
    for (const [pageNumber, spans] of selected.pages) {
      const layer = viewer.getPageView(pageNumber - 1)?.textLayer?.div;
      if (layer?.isConnected) addPageHighlights(layer, spans, selected.ranges, marks);
    }
    CSS.highlights.set('bnitz-soft', marks.soft);
    CSS.highlights.set('bnitz-strong', marks.strong);
  }

  function highlight(viewer, spans, ranges) {
    const relevant = spans.filter(span => ranges.some(range => overlaps(span, range)));
    const pages = Map.groupBy(relevant, span => span.pageNumber);
    const targets = new Set();
    for (const spans of pages.values()) {
      for (const range of ranges) {
        const span = spans.find(span => overlaps(span, range));
        if (span) targets.add(span);
      }
    }
    selected = {pages, ranges, targets};
    paintHighlights(viewer);
    renderMarkers(viewer, targets);
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.tabId !== tabId || message.id !== requested.id) return;
    if (message.type === 'bnitz-map') {
      Promise.all([loading, getEntry()]).then(([{viewer}, entry]) => {
        const map = entry['map.bnitz'];
        const anchors = entry['pdf-anchors.json'];
        if (!selected) highlight(viewer, anchors.pdfSpans, map.spans.flatMap(BNITZModel.highlights));
        respond({map, anchors});
      }).catch(error => respond({error: error.message}));
      return true;
    }
    if (message.type === 'bnitz-highlight') {
      Promise.all([loading, getEntry()]).then(([{viewer}, entry]) => {
        highlight(viewer, entry['pdf-anchors.json'].pdfSpans, message.ranges);
        respond(true);
      }, () => respond(false));
      return true;
    }
  });

  const {eventBus, viewer} = await loading;
  eventBus.on('textlayerrendered', ({pageNumber}) => {
    if (selected?.pages.has(pageNumber)) paintHighlights(viewer);
  });
  const updateMarkers = () => {
    if (selected) renderMarkers(viewer, selected.targets);
  };
  const resize = new ResizeObserver(updateMarkers);
  resize.observe(viewer.viewer);
  resize.observe(viewer.container);
  eventBus.on('pagesloaded', updateMarkers);
}

start().catch(() => chrome.mimeHandler?.abortAndFallbackToNativeHandler());
