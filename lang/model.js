const BNITZModel = (() => {
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
    if (document?.version !== 3) throw new Error('Expected a version 3 .bnitz file.');
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
        !range || !validRange(text, range.start, range.end)
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
  const highlights = span => span.highlights ?? [{start: span.start, end: span.end}];

  const point = angle => [Math.sin(angle), -Math.cos(angle)];
  const turn = 2 * Math.PI;
  const slotCount = Object.keys(relations).length;
  const slotAngle = turn / slotCount;
  const relationDirection = slot => point((slot % slotCount) * slotAngle);

  const planetRadius = 24;
  const gap = 12;

  function layout({nucleus, spans}) {
    const children = new Map(spans.map(span => [span.id, []]));
    for (const span of spans) if (span.id !== nucleus) children.get(span.parent).push(span);

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
    const root = branch(spans.find(span => span.id === nucleus));
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

  return {relations, validRange, validate, label, highlights, relationDirection, planetRadius, layout};
})();

if (typeof module !== 'undefined') module.exports = BNITZModel;
