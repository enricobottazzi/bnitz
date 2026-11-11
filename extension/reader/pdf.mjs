import * as pdfjs from '../pdfjs/pdf.min.mjs';
import {arxivId, arxivPaper} from './arxiv.mjs';

const asset = path => new URL(`../pdfjs/${path}`, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');

function textLines(items) {
  const lines = [];
  let parts = [];
  let index = 0;
  for (const item of items) {
    if (item.str) {
      if (item.transform[0] > 0 && Math.abs(item.transform[1]) < 0.01) {
        parts.push({index, text: item.str, y: item.transform[5], height: item.height});
      }
      index++;
    }
    if (item.hasEOL && parts.length) {
      lines.push({...parts[0], parts, text: parts.map(part => part.text).join('').trim()});
      parts = [];
    }
  }
  if (parts.length) lines.push({...parts[0], parts, text: parts.map(part => part.text).join('').trim()});
  return lines;
}

function extractAbstract(items, paper) {
  const lines = textLines(items);
  const heading = lines.findIndex(line => /^abstract\s*[:.]?$/i.test(line.text));
  if (heading < 0) throw new Error('No abstract heading was found on the first PDF page.');

  const title = lines.slice(0, heading).reduce((largest, line) =>
    line.height > (largest?.height ?? 0) ? line : largest, null)?.text || `arXiv ${paper.id}`;
  const segments = [];
  let text = '';
  let previous = null;
  for (const line of lines.slice(heading + 1)) {
    if (/^(?:\d+\s+)?(?:introduction|keywords|index terms)\b/i.test(line.text)) break;
    if (previous && (line.y > previous.y || previous.y - line.y > 1.8 * previous.height)) break;
    // Keep printed compounds such as “English-to-German” together across line wraps.
    if (previous && !text.endsWith('-') && !/\s$/.test(text)) text += ' ';
    for (const part of line.parts) {
      segments.push({index: part.index, text: part.text, start: text.length, end: text.length + part.text.length});
      text += part.text;
    }
    previous = line;
  }
  if (!text.trim()) throw new Error('The abstract could not be extracted from the first PDF page.');
  return {article: {title, text, source: paper.source}, segments};
}

function paintHighlights(layer, segments, ranges) {
  // PDF.js may remove presentation roles when linking annotations to text.
  const nodes = [...layer.querySelectorAll('span')].map(span => span.firstChild)
    .filter(node => node?.nodeType === Node.TEXT_NODE);
  const marks = {strong: new Highlight(), soft: new Highlight()};
  marks.strong.priority = 1;
  for (const segment of segments) {
    const node = nodes[segment.index];
    if (node?.textContent !== segment.text) continue;
    for (const {start, end, grade} of ranges) {
      const from = Math.max(start, segment.start);
      const to = Math.min(end, segment.end);
      if (from >= to || !Object.hasOwn(marks, grade)) continue;
      const range = new Range();
      range.setStart(node, from - segment.start);
      range.setEnd(node, to - segment.start);
      marks[grade].add(range);
    }
  }
  CSS.highlights.set('bnitz-soft', marks.soft);
  CSS.highlights.set('bnitz-strong', marks.strong);
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
  const getAbstract = () => abstract ??= loading.then(async ({doc}) => {
    const page = await doc.getPage(1);
    const {items} = await page.getTextContent({includeMarkedContent: true, disableNormalization: true});
    return extractAbstract(items, paper);
  });

  let selected;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.tabId !== tabId || message.id !== paper.id) return;
    if (message.type === 'bnitz-abstract') {
      getAbstract().then(({article}) => respond({article}), error => respond({error: error.message}));
      return true;
    }
    if (message.type === 'bnitz-highlight') {
      Promise.all([loading, getAbstract()]).then(([{viewer}, {segments}]) => {
        selected = {segments, ranges: message.ranges};
        const layer = viewer.getPageView(0)?.textLayer?.div;
        if (layer?.isConnected) paintHighlights(layer, segments, selected.ranges);
        respond(true);
      }, () => respond(false));
      return true;
    }
  });

  const {eventBus} = await loading;
  eventBus.on('textlayerrendered', ({pageNumber, source}) => {
    if (pageNumber === 1 && selected) {
      paintHighlights(source.textLayer.div, selected.segments, selected.ranges);
    }
  });
}

start().catch(() => chrome.mimeHandler?.abortAndFallbackToNativeHandler());
