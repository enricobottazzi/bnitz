const BNITZ = (() => {
  const relations = {
    problem: ['Problem', 6, 'problem', 'States the question, gap, or practical problem the parent addresses.'],
    background: ['Background', 1, 'background', 'Gives prior work, definitions, or other context needed to understand the parent.'],
    method: ['Method', 2, 'method', 'Describes how the parent’s result was obtained or how its proposed work would be carried out.'],
    implication: ['Implication', 3, 'implication', 'States what follows from the parent, such as a prediction, an application, or a next step.'],
    evidence: ['Evidence', 4, 'evidence', 'Uses results, analyses, or comparisons to support, challenge, or assess the parent.'],
    scope: ['Scope', 5, 'scope', 'Specifies where, when, or under what conditions the parent applies, including limitations and assumptions. Give a limitation or assumption its own Scope planet when it needs separate attention, and fold brief qualifiers into the parent.'],
  };

  function validRange(text, start, end) {
    const boundary = index => !/[\uDC00-\uDFFF]/.test(text.charAt(index));
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= text.length &&
      start < end && boundary(start) && boundary(end) && Boolean(text.slice(start, end).trim());
  }

  function validate(document) {
    if (document?.version !== 2) throw new Error('Expected a version 2 .bnitz file.');
    const {title, text, nucleus, spans} = document;
    if (typeof title !== 'string' || !title.trim() || typeof text !== 'string' || !Array.isArray(spans)) {
      throw new Error('The file needs a title, abstract, and planets.');
    }
    const byId = new Map();
    for (const span of spans) {
      if (!span || typeof span.id !== 'string' || !span.id || byId.has(span.id)) {
        throw new Error('Every planet needs a unique ID.');
      }
      if (!validRange(text, span.start, span.end)) throw new Error('A planet needs a passage in the abstract.');
      if (Object.hasOwn(span, 'highlights') && (!Array.isArray(span.highlights) || span.highlights.some(range =>
        !range || !['strong', 'soft'].includes(range.grade) || !validRange(text, range.start, range.end)
      ))) throw new Error('A planet has an invalid highlight.');
      byId.set(span.id, span);
    }
    const root = byId.get(nucleus);
    if (!root || root.parent != null || root.relation != null) throw new Error('The file needs one nucleus.');
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
      if (parent !== root) throw new Error('Every planet must lead back to the nucleus without a cycle.');
    }
    return document;
  }

  const label = span => relations[span.relation]?.[0] ?? 'Nucleus';
  const iconUrl = icon => `../assets/${icon}.svg?v=0.0.4`;
  const highlights = span => span.highlights ?? [{start: span.start, end: span.end, grade: 'strong'}];

  const latex = new RegExp([
    /(?<![\\$])\$\$(?<display>(?:\\.|[^\\$])+)\$\$/,
    /(?<![\\$])\$(?![\s$])(?<inline>(?:\\.|[^\\$\r\n])+?)(?<!\s)\$(?![\d$])/,
    /(?<!\\)\{\\em\s+(?<emphasis>[^{}]+)\}/,
    /(?<!\\)\\(?:emph|textit)\{(?<italic>[^{}]+)\}/,
    /\x60\x60(?<quote>[^\x60\r\n]+?)''/,
  ].map(pattern => pattern.source).join('|'), 'gd');

  function paintText(container, text, ranges, onMark, {typeset = false} = {}) {
    const cuts = [...new Set([0, text.length, ...ranges.flatMap(({start, end}) => [start, end])])].sort((a, b) => a - b);
    function append(parent, start, end, content) {
      const matches = ranges.filter(range => range.start < end && range.end > start);
      if (!matches.length) {
        parent.append(content);
        return;
      }
      const mark = document.createElement('mark');
      mark.append(content);
      if (onMark) onMark(mark, matches);
      else mark.className = matches.some(range => range.grade === 'strong') ? 'strong' : 'soft';
      parent.append(mark);
    }

    function plain(parent, start, end) {
      for (const cut of cuts) {
        if (cut <= start) continue;
        if (cut >= end) break;
        append(parent, start, cut, text.slice(start, cut));
        start = cut;
      }
      if (start < end) append(parent, start, end, text.slice(start, end));
    }

    function render(parent, start, end) {
      let cursor = start;
      for (const match of text.slice(start, end).matchAll(latex)) {
        const from = start + match.index;
        const to = from + match[0].length;
        plain(parent, cursor, from);
        const {display, inline, quote} = match.groups;
        if (display || inline) {
          const token = document.createElement('span');
          try {
            globalThis.katex.render(display ?? inline, token, {
              output: 'mathml', displayMode: Boolean(display), trust: false, maxExpand: 100,
            });
            append(parent, from, to, token);
          } catch {
            plain(parent, from, to);
          }
        } else if (quote) {
          append(parent, from, from + 2, '“');
          render(parent, from + 2, to - 2);
          append(parent, to - 2, to, '”');
        } else {
          const [bodyStart, bodyEnd] = match.indices.groups.emphasis ?? match.indices.groups.italic;
          const em = document.createElement('em');
          render(em, start + bodyStart, start + bodyEnd);
          parent.append(em);
        }
        cursor = to;
      }
      plain(parent, cursor, end);
    }

    const fragment = document.createDocumentFragment();
    if (typeset) render(fragment, 0, text.length);
    else plain(fragment, 0, text.length);
    container.replaceChildren(fragment);
  }

  const point = angle => [Math.sin(angle), -Math.cos(angle)];
  const turn = 2 * Math.PI;
  const slotCount = Object.keys(relations).length;
  const slotAngle = turn / slotCount;
  const relationDirection = slot => point((slot % slotCount) * slotAngle);

  function legend(container, onSelect) {
    container.insertAdjacentHTML('beforeend', `
      <div id="relation-clock"></div>
      <p id="relation-definition" aria-live="polite"></p>
    `);
    const clock = container.querySelector('#relation-clock');
    const definition = container.querySelector('#relation-definition');
    const buttons = new Map();

    function showRelation(key) {
      const entry = buttons.get(key);
      if (!entry || entry.button.getAttribute('aria-pressed') === 'true') return;
      clock.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      entry.button.setAttribute('aria-pressed', 'true');
      definition.textContent = entry.description;
    }

    const entries = {
      nucleus: ['Nucleus', null, null, 'The paper’s main contribution. It can be a finding, theorem, argument, synthesis, artifact, guideline, or research plan.'],
      ...relations,
    };
    for (const [key, [label, slot, icon, description]] of Object.entries(entries)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-controls', definition.id);
      const [x, y] = slot == null ? [0, 0] : relationDirection(slot);
      button.style.setProperty('--clock-x', `${50 + x * 35.5}%`);
      button.style.setProperty('--clock-y', `${50 + y * 35.5}%`);
      const symbol = document.createElement(icon ? 'img' : 'span');
      symbol.className = 'legend-symbol';
      if (icon) {
        symbol.src = iconUrl(icon);
        symbol.alt = '';
      } else {
        symbol.classList.add('legend-nucleus');
        symbol.setAttribute('aria-hidden', 'true');
      }
      const name = document.createElement('span');
      name.textContent = label;
      button.append(symbol, name);
      button.addEventListener('click', () => {
        onSelect?.(key);
        showRelation(key);
      });
      buttons.set(key, {button, description: `${label} — ${description}`});
      clock.append(button);
    }
    showRelation('nucleus');
    return showRelation;
  }

  const planetRadius = 24;
  const gap = 12;

  function layout({nucleus, spans}) {
    const children = new Map(spans.map(span => [span.id, []]));
    const byId = new Map(spans.map(span => [span.id, span]));
    for (const span of spans) if (span.id !== nucleus) children.get(span.parent).push(span);

    function group(branches) {
      if (branches.length === 1) return branches[0];
      const biggest = Math.max(...branches.map(branch => branch.radius));
      const distance = (biggest + gap / 2) / Math.sin(Math.PI / branches.length);
      return {
        ring: distance,
        radius: distance + biggest + gap / 2,
        parts: branches.map((branch, index) => ({
          branch, scale: 1, distance, direction: point((index + .5) * turn / branches.length),
        })),
      };
    }

    function branch(span) {
      const slots = new Map();
      const isRoot = span.id === nucleus;
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
      const largest = Math.max(0, ...parts.map(part => part.branch.radius * scale));
      let orbit = size + largest + gap;
      for (const [index, a] of parts.entries()) {
        for (const b of parts.slice(index + 1)) {
          const separation = 2 * Math.abs(Math.sin((a.hour - b.hour) * slotAngle / 2));
          orbit = Math.max(orbit, ((a.branch.radius + b.branch.radius) * scale + gap) / separation);
        }
      }
      for (const part of parts) part.distance = orbit;
      return {
        span, size, parts, ring: parts.length ? orbit : 0,
        radius: parts.length ? orbit + largest : size,
      };
    }

    const rings = [], planets = [];
    const root = branch(byId.get(nucleus));
    function place(branch, x, y, scale) {
      if (branch.ring) rings.push({x, y, radius: branch.ring * scale, group: !branch.span});
      if (branch.span) planets.push({span: branch.span, x, y, radius: branch.size * scale});
      for (const part of branch.parts) {
        const [dx, dy] = part.direction;
        const distance = part.distance * scale;
        place(part.branch, x + dx * distance, y + dy * distance, scale * part.scale);
      }
    }
    place(root, 0, 0, 1);
    return {rings, planets, radius: root.radius + gap};
  }

  function svg(tag, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function map(container, article, onSelect) {
    const {rings, planets, radius} = layout(article);
    const drawing = svg('svg', {viewBox: `${-radius} ${-radius} ${2 * radius} ${2 * radius}`, 'aria-label': 'BNITZ map'});
    const filter = svg('filter', {id: 'planet-lime', 'color-interpolation-filters': 'sRGB'});
    // Tint the white parts of each icon, preserving black ink and transparency.
    filter.append(svg('feColorMatrix', {values: '.87 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'}));
    const definitions = svg('defs', {});
    definitions.append(filter);
    drawing.append(definitions);
    for (const ring of rings) {
      drawing.append(svg('circle', {cx: ring.x, cy: ring.y, r: ring.radius,
        class: ring.group ? 'group-orbit' : 'orbit', 'aria-hidden': 'true'}));
    }
    for (const {span, x, y, radius: r} of planets) {
      const name = label(span);
      const icon = relations[span.relation]?.[2];
      const node = svg('g', {
        transform: `translate(${x} ${y})`, class: 'planet', tabindex: 0, role: 'button',
        'aria-label': `${name}: ${article.text.slice(span.start, span.end).trim()}`, 'aria-pressed': 'false',
      });
      node.dataset.id = span.id;
      const tooltip = svg('title', {});
      tooltip.textContent = name;
      node.append(tooltip, svg('circle', {r: r * .98, class: 'planet-face'}));
      if (icon) {
        node.append(svg('image', {href: iconUrl(icon), x: -r, y: -r, width: r * 2, height: r * 2}));
      } else {
        const strokeWidth = planetRadius * .26;
        node.append(svg('circle', {r: r - strokeWidth / 2, 'stroke-width': strokeWidth, class: 'nucleus'}));
      }
      node.addEventListener('click', () => onSelect(span));
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(span);
        }
      });
      drawing.append(node);
    }
    container.replaceChildren(drawing);
  }

  function select(container, ...ids) {
    for (const node of container.querySelectorAll('.planet')) {
      node.setAttribute('aria-pressed', String(ids.includes(node.dataset.id)));
    }
  }

  return {relations, legend, validRange, validate, label, highlights, paintText, layout, map, select};
})();
