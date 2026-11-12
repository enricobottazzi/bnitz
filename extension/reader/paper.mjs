import {readPdfAbstract} from './abstract.mjs';
import {locateWithGemini} from './abstract-fallback.mjs';
import {loadArxivRecord} from './arxiv.mjs';
import {createEntry} from './cache-entry.mjs';
import {openPaperCache} from './cache.mjs';
import config from './config.mjs';
import {findPassages} from './passages.mjs';
import {generationClient} from './routing.mjs';

function indexBody(text, spans, body) {
  const indexedSpans = [...spans];
  const blocks = body.map(block => {
    const offset = text.length + 2;
    text += `\n\n${block.text}`;
    for (const span of block.spans) {
      indexedSpans.push({...span, start: offset + span.start, end: offset + span.end, nodeOffset: 0});
    }
    return {...block, offset};
  });
  return {text, spans: indexedSpans, blocks};
}

async function addBodyHighlights(map, text, blocks, requestGeneration) {
  const planets = map.spans.map(planet => ({
    id: planet.id,
    quote: map.text.slice(planet.start, planet.end),
    focus: BNITZModel.highlights(planet).map(range => map.text.slice(range.start, range.end)),
  }));
  const additional = new Map(await findPassages(map.title, planets, blocks, requestGeneration));
  return BNITZModel.validate({
    ...map,
    text,
    spans: map.spans.map(planet => ({
      ...planet,
      highlights: [...BNITZModel.highlights(planet), ...(additional.get(planet.id) ?? [])],
    })),
  });
}

export async function loadPaperMap(doc, paper, metadata) {
  const cache = await openPaperCache(paper, config.paperRevision, doc.numPages).catch(() => null);
  const cached = await cache?.get();
  if (cached) return cached;

  metadata ??= (await loadArxivRecord(paper)).article;
  if (!metadata.text) throw new Error('The arXiv record has no abstract.');
  const generation = generationClient(paper);
  const {request} = generation;
  const {article, spans, body} = await readPdfAbstract(doc, metadata, async (fragments, reference) =>
    locateWithGemini(fragments, reference, request));
  const mapped = await request('map', {title: article.title, text: article.text});
  let map = BNITZModel.validate({...mapped, source: article.source});
  const indexed = indexBody(article.text, spans, body);
  if (!indexed.blocks.length) return createEntry(map, spans);
  try {
    map = await addBodyHighlights(map, indexed.text, indexed.blocks, request);
  } catch {
    // Show the abstract map and retry the passage search on the next open.
    return createEntry(map, spans);
  }
  const entry = createEntry(map, indexed.spans);
  if (generation.cacheable) await cache?.put(entry).catch(() => {});
  return entry;
}
