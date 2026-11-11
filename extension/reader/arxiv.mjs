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

export async function loadArxivAbstract(paper) {
  const response = await fetch(paper.source, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Could not load the arXiv abstract.');
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const meta = selector => page.querySelector(selector)?.getAttribute('content')?.trim();
  const title = meta('meta[name="citation_title"]') || meta('meta[property="og:title"]') || `arXiv ${paper.id}`;
  const text = meta('meta[name="citation_abstract"]') || meta('meta[property="og:description"]');
  if (!text) throw new Error('The arXiv record has no abstract.');
  return {title, text, source: paper.source};
}
