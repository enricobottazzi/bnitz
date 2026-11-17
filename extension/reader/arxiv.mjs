const origin = 'https://arxiv.org';
const idPattern = /^(\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(v[1-9]\d*)?$/;

export function arxivPaperFromUrl(url) {
  const id = /^https:\/\/(?:www\.)?arxiv\.org\/html\/([^?#]+)(?:[?#]|$)/.exec(url)?.[1];
  return arxivPaper(id);
}

export function arxivPaper(id) {
  const match = typeof id === 'string' && idPattern.exec(id);
  if (!match) return null;
  const [, paperId, version] = match;
  return {id, paperId, version, source: `${origin}/html/${id}`};
}

// Body ranges count the blank lines between blocks, just as the HTML extractor does.
export const bodySeparator = '\n\n';
export const bodyText = blocks => blocks.map(({text}) => text).join(bodySeparator);
