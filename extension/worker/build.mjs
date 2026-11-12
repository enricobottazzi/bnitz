import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extractionRecipe, mapExampleNames, mapRecipe, passageRecipe} from './recipes.mjs';

export function loadRecipes() {
  const examples = mapExampleNames.map(name =>
    JSON.parse(readFileSync(new URL(`../../examples/${name}.bnitz`, import.meta.url), 'utf8')));
  return {extraction: extractionRecipe, map: mapRecipe(examples), passages: passageRecipe};
}

export function revisionFor(recipe) {
  return createHash('sha256').update(JSON.stringify(recipe)).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const recipes = loadRecipes();
  mkdirSync(new URL('../worker-dist/', import.meta.url), {recursive: true});
  writeFileSync(new URL('../worker-dist/recipe.mjs', import.meta.url),
    `export const recipes = ${JSON.stringify(recipes)};\nexport const revision = ${JSON.stringify(revisionFor(recipes))};\n`);
}
