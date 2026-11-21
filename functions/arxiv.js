const abstractUrl = /^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/abs\/((?:\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(?:v[1-9]\d*)?)\/?(?:[?#][^\s]*)?$/i;

// HTMLRewriter returns attributes with arXiv's HTML escaping still present.
function citationText(value) {
  const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
  return value.trim().replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity, name) => {
    if (Object.hasOwn(named, name)) return named[name];
    if (name[0] !== '#') return entity;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
  });
}

function failure(status, error) {
  return Response.json({error}, {status});
}

export async function onRequestGet({request}) {
  const url = new URL(request.url).searchParams.get('url') || '';
  const match = abstractUrl.exec(url.trim());
  if (!match) return failure(400, 'Enter an arXiv abstract link like https://arxiv.org/abs/1706.03762');
  const source = 'https://arxiv.org/abs/' + match[1];
  const fields = {};
  const authors = [];
  try {
    const response = await fetch(source, {signal: AbortSignal.timeout(12000)});
    if (response.status === 404 || response.status === 410) return failure(404, 'Paper not found on arXiv.');
    if (!response.ok) return failure(502, 'arXiv could not load this paper. Try again.');
    const parser = new HTMLRewriter().on('meta[name^="citation_"]', {
      element(meta) {
        const key = meta.getAttribute('name');
        const value = citationText(meta.getAttribute('content') || '');
        if (key === 'citation_author' && value) {
          const [family, given] = value.split(',');
          const [initial] = given?.trim() || '';
          authors.push(initial ? `${initial}. ${family}` : family);
        } else if (['citation_title', 'citation_abstract', 'citation_date'].includes(key)) {
          fields[key] = value;
        }
      },
    });
    await parser.transform(response).text();
  } catch {
    return failure(502, 'Could not read the arXiv page. Try again.');
  }
  const {citation_title: title, citation_abstract: text, citation_date: date} = fields;
  const year = date?.slice(0, 4);
  if (!title || !text || !authors.length || !/^\d{4}$/.test(year)) {
    return failure(502, 'The arXiv page is missing paper details.');
  }
  const author = authors.length > 2 ? authors[0] + ' et al.' : authors.join(' and ');
  return Response.json({title, text, author, year: Number(year), source});
}
