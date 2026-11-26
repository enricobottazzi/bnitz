import {bodySeparator} from '../reader/arxiv.mjs';
import {uniqueRange} from './map.mjs';

export async function generateBodyHighlights(paper, map, recipe, complete) {
  const planets = map.spans.map(({id, parent, relation, highlights}) => ({
    id, parent: parent ?? '', relation: relation ?? 'core',
    highlights: highlights.map(({start, end}) => paper.abstract.slice(start, end)),
  }));
  const messages = [...recipe.messages, {
    role: 'user', content: JSON.stringify({title: paper.title, abstract: paper.abstract, planets, blocks: paper.body}),
  }];
  const {passages} = JSON.parse(await complete({...recipe.settings, messages}, recipe.timeout));
  if (!Array.isArray(passages)) throw new Error('The model did not return body highlights.');

  const blocks = new Map();
  let offset = 0;
  for (const {id, text} of paper.body) {
    blocks.set(id, {text, offset});
    offset += text.length + bodySeparator.length;
  }
  const highlights = new Map(planets.map(({id}) => [id, []]));
  for (const passage of passages) {
    if (!passage) continue;
    const ranges = highlights.get(passage.planetId);
    const block = blocks.get(passage.block);
    if (!ranges || ranges.length >= 3 || !block) continue;
    const match = uniqueRange(block.text, passage.highlight);
    if (!match) continue;
    const start = block.offset + match.start;
    const end = block.offset + match.end;
    if (ranges.some(range => range.start === start && range.end === end)) continue;
    ranges.push({section: 'body', start, end});
  }
  if (passages.length && ![...highlights.values()].some(ranges => ranges.length)) {
    throw new Error('None of the proposed body highlights match the paper.');
  }
  return highlights;
}

export function paperMap({arxivId, core, spans}, bodyHighlights = new Map()) {
  return {
    version: '3arxiv', arxivId, core,
    spans: spans.map(span => ({
      ...span,
      highlights: [...span.highlights.map(range => ({section: 'abstract', ...range})), ...(bodyHighlights.get(span.id) ?? [])],
    })),
  };
}
