import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const tokenFile = process.argv[2] ?? join(homedir(), 'Desktop', 'TOKEN.md');
const openRouterKey = /^(?:[-*#]+\s*)?`*BNITZ_OPENROUTER`*\s*[:=]\s*[`'"]*(sk-or-v1-[\w-]+)/m
  .exec(readFileSync(tokenFile, 'utf8'))?.[1];
if (!openRouterKey) throw new Error('The BNITZ_OPENROUTER entry is missing from TOKEN.md.');

const dist = here('dist');
rmSync(dist, {recursive: true, force: true});
mkdirSync(dist);

for (const path of ['reader', 'icons']) cpSync(here(path), `${dist}/${path}`, {recursive: true});
// Support the already-installed source directory and the standalone build.
const manifest = readFileSync(here('manifest.json'), 'utf8');
writeFileSync(`${dist}/manifest.json`, manifest.replaceAll('"dist/', '"'));
writeFileSync(`${dist}/reader/local-key`, openRouterKey, {mode: 0o600});
for (const path of ['assets', 'lang', 'bnitz.css', 'RULES.md']) {
  cpSync(here(`../${path}`), `${dist}/${path}`, {recursive: true});
}

mkdirSync(`${dist}/vendor`);
cpSync(here('node_modules/fflate/esm/browser.js'), `${dist}/vendor/fflate.mjs`);
cpSync(here('node_modules/fflate/LICENSE'), `${dist}/vendor/fflate-LICENSE`);

mkdirSync(`${dist}/examples`);
for (const name of ['toy_models_of_superposition', 'scaling_laws_for_neural_language_models']) {
  cpSync(here(`../examples/${name}.bnitz`), `${dist}/examples/${name}.bnitz`);
}

mkdirSync(`${dist}/pdfjs`);
for (const path of ['LICENSE', 'cmaps', 'standard_fonts', 'wasm']) {
  cpSync(here(`node_modules/pdfjs-dist/${path}`), `${dist}/pdfjs/${path}`, {recursive: true});
}
for (const path of ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'web/pdf_viewer.mjs', 'web/pdf_viewer.css']) {
  cpSync(here(`node_modules/pdfjs-dist/${path}`), `${dist}/pdfjs/${path.split('/').at(-1)}`);
}
cpSync(here('node_modules/pdfjs-dist/web/images'), `${dist}/pdfjs/images`, {recursive: true});
