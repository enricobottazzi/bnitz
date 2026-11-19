import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import BNITZModel from '../lang/model.js';
import {uniqueRange} from '../extension/worker/map.mjs';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

async function loadCase({split, readerMap, arxivId, input}) {
  const id = basename(readerMap, '.bnitz');
  let map = await readJson('../' + readerMap);
  if (map.version === '3arxiv') {
    const spans = map.spans.map(span => ({
      ...span, highlights: span.highlights.filter(range => range.section === 'abstract'),
    })).filter(span => span.highlights.length);
    map = BNITZModel.validateAbstractMap({...map, spans}, {arxivId, abstract: input.abstract});
  } else {
    BNITZModel.validate(map);
    if (map.text !== input.abstract) throw new Error(`Evaluation abstract differs from ${readerMap}.`);
  }
  const planets = map.spans.map(span => {
    const highlights = BNITZModel.highlights(span).map(({start, end}) => {
      const excerpt = input.abstract.slice(start, end);
      if (uniqueRange(input.abstract, excerpt)?.start !== start) {
        throw new Error(`Non-unique reference highlight in ${id}/${span.id}.`);
      }
      return excerpt;
    });
    return {id: span.id, parent: span.parent ?? '', relation: span.relation ?? 'nucleus', highlights};
  });
  return {id, split, input, reference: {planets}};
}

export async function loadCases() {
  const cases = await readJson('./cases.json');
  return Promise.all(cases.map(loadCase));
}
