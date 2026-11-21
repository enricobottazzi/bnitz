const BNITZModel = (() => {
  const relations = {
    problem: ['Problem', 6, 'problem'],
    background: ['Background', 1, 'background'],
    method: ['Method', 2, 'method'],
    implication: ['Implication', 3, 'implication'],
    evidence: ['Evidence', 4, 'evidence'],
    scope: ['Scope', 5, 'scope'],
  };

  function parseLegendDefinitions(markdown) {
    const legend = markdown.split(/^##[ \t]+Legend[ \t]*\r?$/m)[1]?.split(/^#{1,2}[ \t]/m)[0] ?? '';
    const definitions = {};
    for (const line of legend.split('\n')) {
      const cells = line.trim().match(/^\|[^|]*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|$/);
      if (!cells) continue;
      const role = cells[1].replaceAll('**', '').trim().toLowerCase();
      if (role === 'core' || Object.hasOwn(relations, role)) {
        definitions[role] = cells[2].trim().replaceAll('\\|', '|');
      }
    }
    for (const role of ['core', ...Object.keys(relations)]) {
      if (!definitions[role]) throw new Error(`Missing ${role} definition in RULES.md.`);
    }
    return definitions;
  }

  function validRange(text, start, end) {
    const boundary = index => !/[\uDC00-\uDFFF]/.test(text.charAt(index));
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= text.length &&
      start < end && boundary(start) && boundary(end) && Boolean(text.slice(start, end).trim());
  }

  function validate(document) {
    if (document?.version !== 3) throw new Error('Expected a version 3 .bnitz file.');
    const {title, text} = document;
    if (typeof title !== 'string' || !title.trim() || typeof text !== 'string' || !Array.isArray(document.spans)) {
      throw new Error('The file needs a title, abstract, and planets.');
    }
    return validateMap(document, text, span => !Object.hasOwn(span, 'highlights') ||
      (Array.isArray(span.highlights) && span.highlights.every(range => range && validRange(text, range.start, range.end))));
  }

  function validateAbstractMap(map, {arxivId, abstract}) {
    if (!arxivId || map?.arxivId !== arxivId) throw new Error('The abstract map does not match the arXiv revision.');
    return validateMap(map, abstract, ({highlights}) => Array.isArray(highlights) && highlights.length > 0 &&
      highlights.every(range => range && validRange(abstract, range.start, range.end)));
  }

  function validateArxiv(document, {arxivId, abstract, body}) {
    if (document?.version !== '3arxiv') throw new Error('Expected a v3arxiv .bnitz file.');
    if (!arxivId || document.arxivId !== arxivId) throw new Error('The map does not match the arXiv revision.');
    if (Object.keys(document).some(key => !['version', 'arxivId', 'core', 'spans'].includes(key))) {
      throw new Error('The arXiv map has unexpected fields.');
    }
    return validateMap(document, abstract, ({highlights}) => Array.isArray(highlights) &&
      highlights.some(range => range?.section === 'abstract') && highlights.every(range => range && (
        (range.section === 'abstract' && validRange(abstract, range.start, range.end)) ||
        (range.section === 'body' && validRange(body, range.start, range.end))
      )));
  }

  function validateMap(document, abstract, validHighlights) {
    const {core, spans} = document;
    if (!Array.isArray(spans)) throw new Error('The map needs planets.');
    const byId = new Map();
    for (const span of spans) {
      if (!span || typeof span.id !== 'string' || !span.id || byId.has(span.id)) {
        throw new Error('Every planet needs a unique ID.');
      }
      if (!validRange(abstract, span.start, span.end)) throw new Error('A planet needs a passage in the abstract.');
      if (!validHighlights(span)) throw new Error('A planet has an invalid highlight.');
      byId.set(span.id, span);
    }
    const root = byId.get(core);
    if (!root || root.parent != null || root.relation != null) throw new Error('The file needs one core.');
    for (const span of spans) {
      if (span === root) continue;
      if (typeof span.relation !== 'string' || !Object.hasOwn(relations, span.relation) || !byId.has(span.parent)) {
        throw new Error('Every attached planet needs an SPST relation and a parent.');
      }
      const visited = new Set([span.id]);
      let parent = byId.get(span.parent);
      while (parent && parent !== root && !visited.has(parent.id)) {
        visited.add(parent.id);
        parent = byId.get(parent.parent);
      }
      if (parent !== root) throw new Error('Every planet must lead back to the core without a cycle.');
    }
    return document;
  }

  const label = span => relations[span.relation]?.[0] ?? 'Core';
  const highlights = span => span.highlights ?? [{start: span.start, end: span.end}];

  // Track a textarea edit in UTF-16 offsets, keeping insertions at a passage's
  // edges outside the passage. Deleted anchors stay empty until re-highlighted.
  function editText(document, text, selection) {
    const before = document.text;
    if (text === before) return document;
    if (selection?.inputType?.endsWith('Backward') && selection.start === selection.end && text.length < before.length) {
      selection = {...selection, start: Math.max(0, selection.start + text.length - before.length)};
    }
    let start = 0;
    while (start < (selection?.start ?? before.length) && start < text.length && before[start] === text[start]) start++;
    if (start > 0 && (/[\uDC00-\uDFFF]/.test(before.charAt(start)) || /[\uDC00-\uDFFF]/.test(text.charAt(start)))) start--;
    let oldEnd = before.length;
    let newEnd = text.length;
    while (oldEnd > (selection?.end ?? 0) && newEnd > (selection ? start : 0) && before[oldEnd - 1] === text[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    start = Math.min(start, oldEnd, newEnd);
    if (/[\uDC00-\uDFFF]/.test(before.charAt(oldEnd))) { oldEnd++; newEnd++; }
    const delta = newEnd - oldEnd;
    const move = range => {
      const from = range.start >= oldEnd ? range.start + delta : Math.min(range.start, start);
      const to = range.end <= start ? range.end : range.end >= oldEnd ? range.end + delta : newEnd;
      return {...range, start: from, end: Math.max(from, to)};
    };
    return {...document, text, spans: document.spans.map(span => {
      const next = {...span, ...move({start: span.start, end: span.end})};
      if (span.highlights) {
        next.highlights = span.highlights.map(move).filter(range => validRange(text, range.start, range.end));
        if (!validRange(text, next.start, next.end) && next.highlights.length) {
          const {start, end} = next.highlights[0];
          Object.assign(next, {start, end});
        }
      }
      return next;
    })};
  }

  const point = angle => [Math.sin(angle), -Math.cos(angle)];
  const turn = 2 * Math.PI;
  const slotCount = Object.keys(relations).length;
  const slotAngle = turn / slotCount;
  const relationDirection = slot => point((slot % slotCount) * slotAngle);

  const planetRadius = 24;
  const gap = 12;

  function layout({core, spans}) {
    const children = new Map(spans.map(span => [span.id, []]));
    for (const span of spans) if (span.id !== core) children.get(span.parent).push(span);

    function group(branches) {
      if (branches.length === 1) return branches[0];
      const biggest = Math.max(...branches.map(branch => branch.radius));
      const distance = (biggest + gap / 2) / Math.sin(Math.PI / branches.length);
      return {
        ring: distance,
        radius: distance + biggest + gap / 2,
        parts: branches.map((branch, index) => ({
          branch, scale: 1, direction: point((index + .5) * turn / branches.length),
        })),
      };
    }

    function branch(span) {
      const slots = new Map();
      const isRoot = span.id === core;
      const size = isRoot ? 36 : planetRadius;
      const scale = isRoot ? 1 : .46;
      const ordered = [...children.get(span.id)].sort((a, b) => a.start - b.start || a.end - b.end);
      for (const child of ordered) {
        const hour = relations[child.relation][1];
        if (!slots.has(hour)) slots.set(hour, []);
        slots.get(hour).push(branch(child));
      }
      const parts = [...slots].map(([hour, branches]) => ({
        hour, branch: group(branches), scale, direction: relationDirection(hour),
      }));
      if (!parts.length) return {span, size, parts, ring: 0, radius: size};
      const largest = Math.max(...parts.map(part => part.branch.radius * scale));
      let orbit = size + largest + gap;
      for (const [index, a] of parts.entries()) {
        for (const b of parts.slice(index + 1)) {
          const separation = 2 * Math.abs(Math.sin((a.hour - b.hour) * slotAngle / 2));
          orbit = Math.max(orbit, ((a.branch.radius + b.branch.radius) * scale + gap) / separation);
        }
      }
      return {span, size, parts, ring: orbit, radius: orbit + largest};
    }

    const rings = [], planets = [];
    const root = branch(spans.find(span => span.id === core));
    function place(branch, x, y, scale) {
      if (branch.ring) rings.push({x, y, radius: branch.ring * scale, group: !branch.span});
      if (branch.span) planets.push({span: branch.span, x, y, radius: branch.size * scale});
      const distance = branch.ring * scale;
      for (const part of branch.parts) {
        const [dx, dy] = part.direction;
        place(part.branch, x + dx * distance, y + dy * distance, scale * part.scale);
      }
    }
    place(root, 0, 0, 1);
    return {rings, planets, radius: root.radius + gap};
  }

  return {parseLegendDefinitions, relations, validRange, validate, validateAbstractMap, validateArxiv, label, highlights, editText, relationDirection, planetRadius, layout};
})();

if (typeof module !== 'undefined') module.exports = BNITZModel;
