export const anchorVersion = 1;
export const overlaps = (span, range) => span.start < range.end && span.end > range.start;

export function cacheKey({paperId, version}, generatorRevision) {
  return `${encodeURIComponent(paperId)}/${version}/${generatorRevision}`;
}

export function validateEntry(entry, source, pageCount = Infinity) {
  const map = BNITZModel.validate(entry?.['map.bnitz']);
  const anchors = entry['pdf-anchors.json'];
  if (map.source !== source || anchors?.anchorVersion !== anchorVersion || !Array.isArray(anchors.pdfSpans)) {
    throw new Error('The cached map or PDF anchors do not match this paper.');
  }
  const {pdfSpans} = anchors;
  const ranges = map.spans.flatMap(BNITZModel.highlights);
  for (const span of pdfSpans) {
    if (!span || !Number.isInteger(span.pageNumber) || span.pageNumber < 1 || span.pageNumber > pageCount ||
        !Number.isInteger(span.index) || span.index < 0 || typeof span.text !== 'string' ||
        !Number.isInteger(span.nodeOffset) || span.nodeOffset < 0 ||
        !Number.isFinite(span.x) || !Number.isFinite(span.y) ||
        !Number.isInteger(span.start) || !Number.isInteger(span.end) ||
        span.start < 0 || span.start >= span.end || span.end > map.text.length ||
        span.nodeOffset + span.end - span.start > span.text.length ||
        map.text.slice(span.start, span.end) !== span.text.slice(span.nodeOffset, span.nodeOffset + span.end - span.start) ||
        !ranges.some(range => overlaps(span, range))) {
      throw new Error('Invalid PDF anchor.');
    }
  }
  const ordered = [...pdfSpans].sort((a, b) => a.start - b.start);
  for (const {start, end} of ranges) {
    let covered = start;
    for (const span of ordered) {
      if (span.start >= end) break;
      if (span.end <= covered) continue;
      if (map.text.slice(covered, span.start).trim()) break;
      covered = span.end;
    }
    if (covered < end && map.text.slice(covered, end).trim()) throw new Error('A highlight is missing PDF anchors.');
  }
  return entry;
}

export function createEntry(map, spans) {
  const ranges = map.spans.flatMap(BNITZModel.highlights);
  return {
    'map.bnitz': map,
    'pdf-anchors.json': {
      anchorVersion,
      pdfSpans: spans.filter(span => ranges.some(range => overlaps(span, range))),
    },
  };
}
