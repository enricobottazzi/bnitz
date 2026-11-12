import {matchPdfQuote} from './abstract.mjs';

export async function findPassages(title, planets, body, requestGeneration) {
  const blocks = body.map(({text}, index) => ({id: index + 1, text}));
  const {passages} = await requestGeneration('passages', {title, planets, blocks});
  const found = new Map(planets.map(({id}) => [id, []]));
  for (const passage of passages) {
    const {planetId, block, quote} = passage ?? {};
    const matches = found.get(planetId);
    const source = Number.isInteger(block) ? body[block - 1] : null;
    if (!matches || matches.length === 3 || !source || typeof quote !== 'string' || quote.length > 300) continue;
    const match = matchPdfQuote(source, quote);
    if (!match) continue;
    const {start, end} = match;
    const span = source.spans.find(span => span.start < end && span.end > start);
    if (!span) continue;
    const location = `${span.pageNumber}:${span.index}:${Math.max(start - span.start, 0)}`;
    if (matches.some(passage => passage.location === location)) continue;
    matches.push({location, range: {start: source.offset + start, end: source.offset + end}});
  }
  return [...found].map(([planetId, matches]) => [planetId, matches.map(passage => passage.range)]);
}
