import BNITZModel from '../../lang/model.js';

function paperMessage({title, authors, affiliations, date, text}) {
  return {role: 'user', content: JSON.stringify({title, authors, affiliations, date, abstract: text})};
}

function uniqueRange(text, excerpt) {
  if (typeof excerpt !== 'string' || !excerpt.trim()) return null;
  const start = text.indexOf(excerpt);
  if (start < 0 || text.indexOf(excerpt, start + 1) >= 0) return null;
  return {start, end: start + excerpt.length};
}

function toGraph({planets}, {title, text}) {
  const roots = planets.filter(planet => planet.relation === 'nucleus');
  if (roots.length !== 1 || roots[0].parent !== '') throw new Error('The map needs exactly one nucleus.');
  const [root] = roots;
  const spans = planets.map(planet => {
    if (!Array.isArray(planet.highlights) || !planet.highlights.length) {
      throw new Error('Each planet needs a highlight.');
    }
    const highlights = planet.highlights.map(excerpt => {
      const match = uniqueRange(text, excerpt);
      if (!match) throw new Error('A highlight does not uniquely match the abstract.');
      return match;
    });
    const [anchor] = highlights;
    const parent = planet === root ? {} : {parent: planet.parent, relation: planet.relation};
    return {id: planet.id, ...anchor, ...parent, highlights};
  });
  const graph = {nucleus: root.id, spans};
  BNITZModel.validate({version: 3, title, text, ...graph});
  return graph;
}

export async function generateMap(article, recipe, complete) {
  const {settings, attempts, timeout, retryPrompt} = recipe;
  const messages = [...recipe.messages, paperMessage(article)];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const content = await complete({...settings, messages}, timeout);
    try {
      return toGraph(JSON.parse(content), article);
    } catch (error) {
      if (attempt + 1 === attempts) throw new Error('Gemini did not return a valid map grounded in the abstract.');
      messages.push({role: 'assistant', content: content || '{}'}, {
        role: 'user', content: `${retryPrompt} ${error.message}`,
      });
    }
  }
}
