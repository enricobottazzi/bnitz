import * as pdfjs from '../pdfjs/pdf.min.mjs';
import {readPdfAbstract} from './abstract.mjs';
import {locateWithGemini} from './abstract-fallback.mjs';
import {arxivId, arxivPaper, loadArxivAbstract} from './arxiv.mjs';
import {loadOpenRouterKey} from './openrouter.mjs';

const asset = path => new URL(`../pdfjs/${path}`, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');

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

function scrollToHighlight(viewer, spans, ranges) {
  const target = spans.find(span => ranges.some(range =>
    range.grade === 'strong' && span.start < range.end && span.end > range.start));
  if (!target) return;
  viewer.scrollPageIntoView({
    pageNumber: target.pageNumber,
    destArray: [null, {name: 'XYZ'}, target.x, target.y, null],
    center: 'both',
    ignoreDestinationZoom: true,
  });
}

async function loadViewer(streamUrl) {
  const response = await fetch(streamUrl, {signal: AbortSignal.timeout(25000)});
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
  const paper = arxivPaper(arxivId(originalUrl));
  if (!paper) return handler.abortAndFallbackToNativeHandler();

  const loading = loadViewer(streamUrl);
  let abstract;
  const getAbstract = () => abstract ??= Promise.all([loading, loadArxivAbstract(paper)])
    .then(([{doc}, metadata]) => readPdfAbstract(doc, metadata, async (fragments, reference) =>
      locateWithGemini(fragments, reference, await loadOpenRouterKey())));

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

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.tabId !== tabId || message.id !== paper.id) return;
    if (message.type === 'bnitz-abstract') {
      getAbstract().then(({article}) => respond({article}), error => respond({error: error.message}));
      return true;
    }
    if (message.type === 'bnitz-highlight') {
      Promise.all([loading, getAbstract()]).then(([{viewer}, {spans}]) => {
        selected = {pages: Map.groupBy(spans, span => span.pageNumber), ranges: message.ranges};
        paintHighlights(viewer);
        if (message.follow) scrollToHighlight(viewer, spans, selected.ranges);
        respond(true);
      }, () => respond(false));
      return true;
    }
  });

  const {eventBus, viewer} = await loading;
  eventBus.on('textlayerrendered', ({pageNumber}) => {
    if (selected?.pages.has(pageNumber)) paintHighlights(viewer);
  });
}

start().catch(() => chrome.mimeHandler?.abortAndFallbackToNativeHandler());
