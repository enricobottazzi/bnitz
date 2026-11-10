function abstractPage(value) {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;

  if (['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname)) {
    const paper = url.pathname.match(/^\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z][a-z0-9.-]*\/\d{7})(?:v[1-9]\d*)?)(?:\.pdf)?\/?$/i);
    return paper ? `https://arxiv.org/abs/${paper[1]}` : null;
  }

  if (['eprint.iacr.org', 'ia.cr'].includes(url.hostname)) {
    const paper = url.pathname.match(/^\/(\d{4}\/\d+)(?:\.pdf)?\/?$/);
    return paper ? `https://eprint.iacr.org/${paper[1]}` : null;
  }

  return null;
}

export async function onRequestGet({request}) {
  const source = abstractPage(new URL(request.url).searchParams.get('url'));
  if (!source) return Response.json({error: 'Enter a paper link from arXiv or IACR ePrint.'}, {status: 400});

  try {
    const page = await fetch(source, {redirect: 'manual', signal: AbortSignal.timeout(10000)});
    if (page.status === 404) return Response.json({error: 'The archive could not find this paper.'}, {status: 404});
    if (!page.ok) throw new Error(`Archive returned ${page.status}`);

    const authors = [];
    let title, date, abstract, description;
    const parsed = new HTMLRewriter().on('meta', {
      element(meta) {
        const content = meta.getAttribute('content')?.trim();
        if (!content) return;
        switch (meta.getAttribute('name')) {
          case 'citation_title': title = content; break;
          case 'citation_author': authors.push(content); break;
          case 'citation_date':
          case 'citation_publication_date': date = content; break;
          case 'citation_abstract': abstract = content; break;
        }
        if (meta.getAttribute('property') === 'og:description') description = content;
      },
    }).transform(page);
    await parsed.arrayBuffer();

    const text = abstract ?? description;
    if (!title || !text) return Response.json({error: 'The archive page did not contain an abstract.'}, {status: 422});
    const year = Number(date?.slice(0, 4)) || undefined;
    return Response.json({title, authors, year, text, source});
  } catch {
    return Response.json({error: 'Could not fetch the abstract from the archive. Try again or paste the abstract manually.'}, {status: 502});
  }
}
