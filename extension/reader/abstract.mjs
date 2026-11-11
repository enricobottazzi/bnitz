function pdfLines(items, pageNumber) {
  const lines = [];
  let parts = [];
  let index = 0;
  for (const item of items) {
    if (item.str) {
      const [scaleX, skewY, , scaleY, x, y] = item.transform;
      if (scaleX !== 0 && Math.abs(skewY) < 0.01) {
        parts.push({pageNumber, index, text: item.str, x, y, width: item.width, size: Math.abs(scaleY)});
      }
      index++;
    }
    if (item.hasEOL && parts.length) {
      lines.push(parts);
      parts = [];
    }
  }
  if (parts.length) lines.push(parts);
  return lines;
}

function wordKey(word) {
  return word.normalize('NFKC').toLowerCase();
}

function hasWrappedWord(text, line, words) {
  if (!text.endsWith('-')) return false;
  const before = text.match(/([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)-$/u)?.[1];
  const after = line.map(part => part.text).join('').match(/^\s*([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)/u)?.[1];
  return before && after && words.has(wordKey(before + after));
}

function indexedText(lines, words) {
  let text = '';
  const spans = [];
  for (const line of lines) {
    if (text.endsWith('\u00ad') || hasWrappedWord(text, line, words)) {
      text = text.slice(0, -1);
      const last = spans.at(-1);
      last.end--;
      if (last.start === last.end) spans.pop();
    } else if (text && !/[-\s]$/.test(text)) {
      text += ' ';
    }
    let previous;
    for (const part of line) {
      if (previous && !/\s$/.test(text) && !/^\s/.test(part.text) &&
          part.x - previous.x - previous.width > part.size * 0.2) text += ' ';
      const start = text.length;
      text += part.text;
      spans.push({pageNumber: part.pageNumber, index: part.index, text: part.text, start, end: text.length});
      previous = part;
    }
  }
  return {text, spans};
}

function normalized(text) {
  let key = '';
  const starts = [];
  const ends = [];
  for (const {0: char, index} of text.matchAll(/\S/gu)) {
    const fragment = char.normalize('NFKC').toLowerCase().replace(/[\s\u00ad]/gu, '');
    key += fragment;
    for (let i = 0; i < fragment.length; i++) {
      starts.push(index);
      ends.push(index + char.length);
    }
  }
  return {key, starts, ends};
}

function clipText({text, spans}, start, end) {
  if (start >= end || !text.slice(start, end).trim()) return null;
  return {
    text: text.slice(start, end),
    spans: spans.filter(span => span.start < end && span.end > start).map(span => ({
      pageNumber: span.pageNumber, index: span.index, text: span.text,
      nodeOffset: Math.max(0, start - span.start),
      start: Math.max(0, span.start - start), end: Math.min(span.end, end) - start,
    })),
  };
}

function findExactMatch(indexed, reference) {
  if (!reference) return null;
  const {text} = indexed;
  const {key, starts, ends} = normalized(text);
  const match = key.indexOf(reference);
  if (match < 0 || key.indexOf(reference, match + 1) >= 0) return null;
  const start = starts[match];
  const end = ends[match + reference.length - 1];
  if (/[\p{L}\p{N}]/u.test(text[start - 1] ?? '') || /[\p{L}\p{N}]/u.test(text[end] ?? '')) return null;
  return clipText(indexed, start, end);
}

async function findWithFallback(lines, metadata, words, locate) {
  if (!locate || !lines.length) return null;
  const fragments = lines.map((line, index) => {
    const first = line[0];
    return {id: index + 1, page: first.pageNumber, x: Math.round(first.x), y: Math.round(first.y),
      size: Math.round(first.size), text: indexedText([line], words).text.trim()};
  });
  const result = await locate(fragments, metadata);
  if (!Array.isArray(result?.lines) || !result.lines.length || typeof result.skipStart !== 'string' ||
      typeof result.skipEnd !== 'string' || new Set(result.lines).size !== result.lines.length ||
      result.lines.some(id => !Number.isInteger(id) || !lines[id - 1])) return null;

  const indexed = indexedText(result.lines.map(id => lines[id - 1]), words);
  const first = fragments[result.lines[0] - 1].text;
  const last = fragments[result.lines.at(-1) - 1].text;
  const prefix = result.skipStart.trim();
  const suffix = result.skipEnd.trim();
  if (!first.startsWith(prefix) || !last.endsWith(suffix) ||
      (prefix && prefix.length === first.length) || (suffix && suffix.length === last.length)) return null;
  const start = indexed.text.length - indexed.text.trimStart().length + prefix.length;
  const end = indexed.text.trimEnd().length - suffix.length;
  const text = indexed.text.slice(start, end);
  if (/[\p{Cc}\uFFFD]/u.test(text.replace(/\s/gu, ''))) return null;
  return clipText(indexed, start + text.length - text.trimStart().length, end - (text.length - text.trimEnd().length));
}

export async function readPdfAbstract(doc, metadata, locate) {
  const {key} = normalized(metadata.text);
  const words = new Set(wordKey(metadata.text).match(/[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu));
  const lines = [];
  for (let pageNumber = 1; pageNumber <= Math.min(3, doc.numPages); pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const {items} = await page.getTextContent({includeMarkedContent: true, disableNormalization: true});
    lines.push(...pdfLines(items, pageNumber));
    const match = findExactMatch(indexedText(lines, words), key);
    if (match) return {article: {...metadata, text: match.text}, spans: match.spans};
  }
  const match = await findWithFallback(lines, metadata, words, locate);
  if (match) return {article: {...metadata, text: match.text}, spans: match.spans};
  throw new Error('BNITZ could not reliably locate the abstract in this PDF.');
}
