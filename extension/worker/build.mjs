import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {bodyPassageRecipe, mapRecipe} from './recipes.mjs';

const examples = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const recipes = {
  abstract: mapRecipe(examples('./abstract-map-examples.json'), 'lean'),
  body: bodyPassageRecipe(examples('./body-passage-examples.json')),
};
const output = new URL('../worker-dist/', import.meta.url);
mkdirSync(output, {recursive: true});
writeFileSync(new URL('./recipe.mjs', output), 'export const recipes = ' + JSON.stringify(recipes) + ';\n');
