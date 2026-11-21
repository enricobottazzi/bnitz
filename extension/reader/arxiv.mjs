const idPattern = /^(\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(v[1-9]\d*)?$/;

export function arxivPaperFromUrl(url) {
  const match = /^https:\/\/(?:www\.)?arxiv\.org\/(abs|pdf|html)\/([^?#]+)(?:[?#]|$)/.exec(url);
  if (!match) return null;
  const [, format, path] = match;
  const paper = arxivPaper(format === 'pdf' ? path.replace(/\.pdf$/, '') : path);
  return paper && {...paper, format};
}

export function arxivPaper(id) {
  const match = typeof id === 'string' && idPattern.exec(id);
  if (!match) return null;
  const [, paperId, version] = match;
  return {id, paperId, version};
}

// Body ranges count the blank lines between blocks, just as the HTML extractor does.
export const bodySeparator = '\n\n';
export const bodyText = blocks => blocks.map(({text}) => text).join(bodySeparator);
