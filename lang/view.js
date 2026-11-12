const BNITZView = (() => {
  const {relations, label, relationDirection, planetRadius, layout} = BNITZModel;
  const iconUrl = icon => `../assets/${icon}.svg?v=0.0.4`;

  function textElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  const latex = new RegExp([
    /(?<![\\$])\$\$(?<display>(?:\\.|[^\\$])+)\$\$/,
    /(?<![\\$])\$(?![\s$])(?<inline>(?:\\.|[^\\$\r\n])+?)(?<!\s)\$(?![\d$])/,
    /(?<!\\)\{\\em\s+(?<emphasis>[^{}]+)\}/,
    /(?<!\\)\\(?:emph|textit)\{(?<italic>[^{}]+)\}/,
    /\x60\x60(?<quote>[^\x60\r\n]+?)''/,
  ].map(pattern => pattern.source).join('|'), 'gd');

  function paintText(container, text, ranges, onMark, {typeset = false, onSegment} = {}) {
    const cuts = [...new Set([0, text.length, ...ranges.flatMap(({start, end}) => [start, end])])].sort((a, b) => a - b);
    function append(parent, start, end, content) {
      const node = typeof content === 'string' ? document.createTextNode(content) : content;
      onSegment?.(node, start, end);
      const matches = ranges.filter(range => range.start < end && range.end > start);
      if (!matches.length) return parent.append(node);
      const mark = document.createElement('mark');
      mark.append(node);
      onMark?.(mark, matches);
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
      button.append(symbol, textElement('span', label));
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
        'aria-label': `${name}: ${article.text.slice(span.start, span.end).trim()}`, 'aria-pressed': 'false', 'data-id': span.id,
      });
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

  return {textElement, legend, paintText, map, select};
})();
