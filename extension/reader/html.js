(() => {
  const omitted = 'nav, script, style, template, form, .ltx_title_abstract, .ltx_keywords, .ltx_note, .ltx_rdf';
  const bodyOmitted = `${omitted}, footer, .ltx_abstract, .ltx_title_document, .ltx_authors, .ltx_dates,
    .ltx_pubnotes, .ltx_toclist, .ltx_pagination, .ltx_bibliography,
    .ltx_appendix, .ltx_acknowledgements, .ltx_acknowledgments`;
  const blocks = 'h1, h2, h3, h4, h5, h6, p, pre, li, tr, figcaption, .ltx_para, .ltx_equation';
  const clean = text => text.replace(/\s+/g, ' ').trim();
  let snapshot, track;
  let targets = [];
  const markedMath = new Set();
  const resizeObserver = new ResizeObserver(updateTrack);
  window.addEventListener('resize', updateTrack);

  function readByline(article) {
    const unique = values => [...new Set(values.filter(Boolean))];
    const text = node => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll('.ltx_contact_name, .ltx_note, .ltx_role_email, a[href^="mailto:"]')
        .forEach(element => element.remove());
      return clean(copy.textContent);
    };
    const names = [...article.querySelectorAll('.ltx_authors .ltx_role_author .ltx_personname')]
      .map(node => text(node).replace(/(?:^|\s)\S+@\S+$/u, '').replace(/[*∗†‡]+$/u, '').trim());
    const declared = [...article.querySelectorAll('.ltx_rdf[property="dcterms:creator"][content]')]
      .map(node => clean(node.getAttribute('content')));
    const affiliations = [...article.querySelectorAll('.ltx_authors .ltx_role_affiliation')]
      .map(text).filter(value => value && !/^[*∗†‡]+$|^corresponding author\b/iu.test(value));
    return {authors: unique(names.some(Boolean) ? names : declared), affiliations: unique(affiliations)};
  }

  function readText(root, parts, exclude = node => node.matches(omitted)) {
    let text = '', pending = '';
    const separate = value => { if (text && value.length > pending.length) pending = value; };
    function append(value, node, offset) {
      if (!value) return;
      text += pending;
      pending = '';
      parts?.push({node, offset, start: text.length, end: text.length + value.length});
      text += value;
    }
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const {0: word, index} of node.data.matchAll(/\s+|\S+/g)) {
          if (word.trim()) append(word, node, index);
          else separate(' ');
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && !exclude(node)) {
        const paragraph = node.matches(blocks);
        if (paragraph) separate('\n\n');
        if (node.localName === 'math') {
          const latex = node.getAttribute('alttext') || node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
          const delimiter = node.getAttribute('display') === 'block' || node.closest('.ltx_equation') ? '$$' : '$';
          append(latex ? delimiter + clean(latex) + delimiter : clean(node.textContent), node, 0);
        } else if (node.matches('br')) {
          separate(' ');
        } else {
          for (const child of node.childNodes) visit(child);
        }
        if (paragraph) separate('\n\n');
        else if (node.matches('td, th')) separate(' ');
      }
    }
    if (root) visit(root);
    return text;
  }

  function omitFromBody(node) {
    if (node.matches(bodyOmitted)) return true;
    if (!node.matches('section, .ltx_section')) return false;
    const heading = node.querySelector(':scope > :is(h1, h2, h3, h4, h5, h6)');
    const label = clean(readText(heading, null, element => element.matches(`${omitted}, .ltx_tag`)))
      .replace(/^\d+(?:\.\d+)*[.)]?\s+/, '');
    return /^appendi(?:x|ces)(?:$|[\s:.–—])/i.test(label) || /^acknowledg(?:e)?ments?[.!:]?$/i.test(label);
  }

  function paperPage() {
    const article = document.querySelector('article.ltx_document');
    if (!article) throw new Error('This arXiv page has no full HTML article.');
    const abstract = article.querySelector('.ltx_abstract');
    if (!abstract) throw new Error('The arXiv HTML has no tagged abstract.');
    const watermark = clean(document.querySelector('#watermark-tr')?.textContent ?? '');
    const revision = watermark.match(/^arXiv:\s*(\S+)/i)?.[1];
    if (!revision) throw new Error('Could not verify the arXiv HTML revision.');
    const date = watermark.match(/\]\s+(\d{1,2} [A-Za-z]{3} \d{4})$/)?.[1] ?? null;
    return {article, abstract, revision, source: `https://arxiv.org/html/${revision}`, date};
  }

  function readPaper() {
    const {article, abstract, revision, source, date} = paperPage();
    const abstractParts = [], bodyParts = [];
    const text = readText(abstract, abstractParts);
    if (!text) throw new Error('The tagged arXiv abstract is empty.');
    const titleNode = article.querySelector('.ltx_title_document, h1');
    const titleText = readText(titleNode, null, node => node.matches(`${omitted}, .ltx_pubnotes`));
    const title = clean(titleText) || 'arXiv ' + revision;
    const bodyText = readText(article, bodyParts, omitFromBody);
    const body = bodyText.split('\n\n').filter(Boolean)
      .map((text, index) => ({id: `b${index + 1}`, text}));
    const snapshotId = crypto.randomUUID();
    snapshot = {revision, snapshotId, sections: new Map([
      ['abstract', {text, parts: abstractParts}], ['body', {text: bodyText, parts: bodyParts}],
    ])};
    clearHighlights();
    resizeObserver.disconnect();
    resizeObserver.observe(article);
    return {title, source, ...readByline(article), date, abstract: text, body, snapshotId};
  }

  function clearHighlights() {
    CSS.highlights.delete('bnitz-paper');
    for (const node of markedMath) node.removeAttribute('data-bnitz-highlight');
    markedMath.clear();
    targets = [];
    track?.replaceChildren();
  }

  function updateTrack() {
    if (!track) return;
    const height = document.scrollingElement.scrollHeight;
    const markers = [];
    for (const elements of targets) {
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        if (!rect.height) continue;
        const top = Math.min(100, Math.max(0, 100 * (rect.top + window.scrollY) / height));
        const tick = document.createElement('span');
        tick.style.top = `${top}%`;
        markers.push(tick);
        break;
      }
    }
    track.replaceChildren(...markers);
  }

  function highlight({arxivId, snapshotId, ranges}) {
    if (!snapshot || arxivId !== snapshot.revision || snapshotId !== snapshot.snapshotId || !Array.isArray(ranges)) {
      throw new Error('The map does not match this arXiv page.');
    }
    clearHighlights();
    const marks = new Highlight();
    const math = new Set(), locations = [];
    for (const {section, start, end} of ranges) {
      const data = snapshot.sections.get(section);
      if (!data || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > data.text.length) {
        throw new Error('The map has an invalid highlight.');
      }
      const bounds = new Map();
      for (const part of data.parts) {
        if (part.start >= end) break;
        const from = Math.max(start, part.start), to = Math.min(end, part.end);
        const {node, offset} = part;
        if (from >= to) continue;
        if (!node.isConnected || (node.nodeType === Node.TEXT_NODE &&
          node.data.slice(offset, offset + part.end - part.start) !== data.text.slice(part.start, part.end))) {
          throw new Error('The arXiv page changed. Reload it to remap the paper.');
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          bounds.set(node, null);
        } else {
          const existing = bounds.get(node);
          bounds.set(node, [existing?.[0] ?? offset + from - part.start, offset + to - part.start]);
        }
      }
      const anchors = [];
      for (const [node, offsets] of bounds) {
        if (!offsets) {
          math.add(node);
          anchors.push(node);
          continue;
        }
        const range = new Range();
        range.setStart(node, offsets[0]);
        range.setEnd(node, offsets[1]);
        marks.add(range);
        anchors.push(range);
      }
      locations.push(anchors);
    }
    for (const node of math) {
      node.setAttribute('data-bnitz-highlight', '');
      markedMath.add(node);
    }
    CSS.highlights.set('bnitz-paper', marks);
    if (!track) {
      track = document.createElement('div');
      track.className = 'bnitz-highlight-track';
      track.setAttribute('aria-hidden', 'true');
      document.body.append(track);
    }
    targets = locations;
    updateTrack();
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    try {
      if (message.type === 'bnitz-paper') {
        respond(readPaper());
      } else if (message.type === 'bnitz-highlight') {
        highlight(message);
        respond({});
      }
    } catch (error) {
      respond({error: error.message});
    }
  });
})();
