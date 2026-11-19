import BNITZModel from '../lang/model.js';
import {uniqueRange} from '../extension/worker/map.mjs';

export function playgroundMap({title, abstract, authors, date}, {planets}) {
  const nucleus = planets.find(planet => planet.relation === 'nucleus')?.id;
  const spans = planets.map(({id, parent, relation, highlights}) => {
    const ranges = highlights.map(excerpt => {
      const range = uniqueRange(abstract, excerpt);
      if (!range) throw Error('A playground highlight does not uniquely match the abstract.');
      return range;
    });
    return {id, ...ranges[0], ...(id === nucleus ? {} : {parent, relation}), highlights: ranges};
  });
  const author = authors?.join(', ');
  const year = date?.match(/\b\d{4}\b/)?.[0];
  const map = BNITZModel.validate({version: 3, title, text: abstract,
    ...(author && {author}), ...(year && {year: Number(year)}), nucleus, spans});
  return JSON.stringify(map);
}
