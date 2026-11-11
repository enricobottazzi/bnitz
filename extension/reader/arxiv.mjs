const origin = 'https://arxiv.org';
const idPattern = /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(?:v[1-9]\d*)?$/;

export function arxivId(url) {
  const match = /^https:\/\/(?:www\.)?arxiv\.org\/pdf\/([^?#]+)(?:[?#]|$)/.exec(url);
  const id = match?.[1].replace(/\.pdf$/, '');
  return idPattern.test(id ?? '') ? id : null;
}

export function arxivPaper(id) {
  if (!idPattern.test(id ?? '')) return null;
  return {id, pdf: `${origin}/pdf/${id}`, source: `${origin}/abs/${id}`};
}
