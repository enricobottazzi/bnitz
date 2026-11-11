const origin = 'https://arxiv.org';
const idPattern = /^(\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(v[1-9]\d*)?$/;

export function arxivId(url) {
  const match = /^https:\/\/(?:www\.)?arxiv\.org\/pdf\/([^?#]+)(?:[?#]|$)/.exec(url);
  const id = match?.[1].replace(/\.pdf$/, '');
  return idPattern.test(id ?? '') ? id : null;
}

export function arxivPaper(id) {
  const match = idPattern.exec(id ?? '');
  if (!match) return null;
  const [, paperId, version] = match;
  return {id, paperId, version, pdf: `${origin}/pdf/${id}`, source: `${origin}/abs/${id}`};
}

export async function loadArxivRecord(paper) {
  const response = await fetch(paper.source, {cache: 'no-cache', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Could not load the arXiv abstract.');
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const meta = selector => page.querySelector(selector)?.getAttribute('content')?.trim();
  if (!paper.version) {
    // The versioned link in "Cite as" identifies the abstract on this page.
    for (const link of page.querySelectorAll('.arxivid a[href]')) {
      const url = new URL(link.getAttribute('href'), paper.source);
      if (url.origin !== origin || !url.pathname.startsWith('/abs/')) continue;
      const revision = arxivPaper(url.pathname.slice('/abs/'.length));
      if (revision?.paperId === paper.paperId && revision.version) {
        paper = revision;
        break;
      }
    }
    if (!paper.version) {
      const versions = page.querySelector('.submission-history')?.textContent.matchAll(/\[(v[1-9]\d*)\]/g);
      const latest = Array.from(versions ?? []).at(-1)?.[1];
      if (latest) paper = arxivPaper(paper.paperId + latest);
    }
  }
  const title = meta('meta[name="citation_title"]') || meta('meta[property="og:title"]') || `arXiv ${paper.id}`;
  const text = meta('meta[name="citation_abstract"]') || meta('meta[property="og:description"]');
  return {paper, article: {title, text, source: paper.source}};
}
