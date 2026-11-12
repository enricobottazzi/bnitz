import {readPdfAbstract} from './abstract.mjs';
import {extractionRecipe, locateWithGemini} from './abstract-fallback.mjs';
import {loadArxivRecord} from './arxiv.mjs';
import {anchorVersion, createEntry} from './cache-entry.mjs';
import {openPaperCache} from './cache.mjs';
import {generateMap, mapRecipe} from './generate.mjs';
import {loadOpenRouterKey} from './openrouter.mjs';
import {findPassages, passageRecipe} from './passages.mjs';

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

async function addBodyHighlights(map, text, blocks, key) {
  const planets = map.spans.map(planet => ({
    id: planet.id,
    quote: map.text.slice(planet.start, planet.end),
    focus: BNITZModel.highlights(planet).map(range => map.text.slice(range.start, range.end)),
  }));
  const additional = new Map(await findPassages(map.title, planets, blocks, key));
  return BNITZModel.validate({
    ...map,
    text,
    spans: map.spans.map(planet => ({
      ...planet,
      highlights: [...BNITZModel.highlights(planet), ...(additional.get(planet.id) ?? [])],
    })),
  });
}

export async function loadPaperMap(doc, paper, metadata, pdfjsVersion) {
  const recipe = {
    extraction: extractionRecipe,
    map: await mapRecipe(),
    passages: passageRecipe,
    pdfjsVersion,
    anchorVersion,
  };
  const cache = await openPaperCache(paper, recipe, doc.numPages).catch(() => null);
  const cached = await cache?.get();
  if (cached) return cached;

  metadata ??= (await loadArxivRecord(paper)).article;
  if (!metadata.text) throw new Error('The arXiv record has no abstract.');
  let apiKey;
  const loadKey = () => apiKey ??= loadOpenRouterKey();
  const {article, spans, body} = await readPdfAbstract(doc, metadata, async (fragments, reference) =>
    locateWithGemini(fragments, reference, await loadKey(), recipe.extraction));
  let map = await generateMap(article, await loadKey(), recipe.map);
  const indexed = indexBody(article.text, spans, body);
  if (!indexed.blocks.length) return createEntry(map, spans);
  try {
    map = await addBodyHighlights(map, indexed.text, indexed.blocks, await loadKey());
  } catch {
    // Show the abstract map and retry the passage search on the next open.
    return createEntry(map, spans);
  }
  const entry = createEntry(map, indexed.spans);
  await cache?.put(entry).catch(() => {});
  return entry;
}
