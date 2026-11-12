import BNITZModel from '../../lang/model.js';

export function paperMessage({title, text}) {
  return {role: 'user', content: JSON.stringify({title, abstract: text})};
}

function uniqueRange(text, quote, offset = 0) {
  if (typeof quote !== 'string' || !quote.trim()) return null;
  const start = text.indexOf(quote);
  if (start < 0 || text.indexOf(quote, start + 1) >= 0) return null;
  return {start: offset + start, end: offset + start + quote.length};
}

function toDocument({planets}, {title, text, source}) {
  const roots = planets.filter(planet => planet.relation === 'nucleus');
  if (roots.length !== 1 || roots[0].parent !== '') throw new Error('The map needs exactly one nucleus.');
  const [root] = roots;
  const spans = planets.map(planet => {
    const range = uniqueRange(text, planet.quote);
    if (!range) throw new Error('A planet quote does not uniquely match the abstract.');
    const highlights = planet.highlights.map(quote => {
      const match = uniqueRange(planet.quote, quote, range.start) ?? uniqueRange(text, quote);
      if (!match) throw new Error('A highlight quote does not uniquely match the abstract.');
      return match;
    });
    if (!highlights.length) throw new Error('Each planet needs a highlight.');
    const parent = planet === root ? {} : {parent: planet.parent, relation: planet.relation};
    return {id: planet.id, ...range, ...parent, highlights};
  });
  return BNITZModel.validate({version: 3, title, text, source, nucleus: root.id, spans});
}

export async function generateMap(article, recipe, complete) {
  const {settings, attempts, timeout, retryPrompt} = recipe;
  const messages = [...recipe.messages, paperMessage(article)];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const content = await complete({...settings, messages}, timeout);
    try {
      return toDocument(JSON.parse(content), article);
    } catch (error) {
      if (attempt + 1 === attempts) throw new Error('Gemini did not return a valid map grounded in the abstract.');
      messages.push({role: 'assistant', content: content || '{}'}, {
        role: 'user', content: `${retryPrompt} ${error.message}`,
      });
    }
  }
}
