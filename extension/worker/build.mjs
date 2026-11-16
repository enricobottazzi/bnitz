import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {mapRecipe} from './recipes.mjs';

const examples = JSON.parse(readFileSync(new URL('./abstract-map-examples.json', import.meta.url), 'utf8'));
const recipe = JSON.stringify(mapRecipe(examples));
const revision = createHash('sha256').update(recipe).digest('hex');
const output = new URL('../worker-dist/', import.meta.url);
mkdirSync(output, {recursive: true});
writeFileSync(new URL('./recipe.mjs', output),
  'export const recipe = ' + recipe + ';\nexport const revision = ' + JSON.stringify(revision) + ';\n');
