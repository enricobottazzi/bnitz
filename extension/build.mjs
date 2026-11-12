import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {anchorVersion} from './reader/cache-entry.mjs';
import {loadRecipes, revisionFor} from './worker/build.mjs';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const defaultOrigin = 'https://bnitz-routing.enricobottazzi.workers.dev';
const worker = new URL(process.env.BNITZ_WORKER_ORIGIN ?? defaultOrigin);
const localWorker = worker.protocol === 'http:' && worker.hostname === '127.0.0.1';
if ((!localWorker && worker.protocol !== 'https:') ||
    worker.pathname !== '/' || worker.search || worker.hash || worker.username || worker.password) {
  throw new Error('BNITZ_WORKER_ORIGIN must be an HTTPS origin or http://127.0.0.1 for local development.');
}

const recipes = loadRecipes();
const {version: pdfjsVersion} = JSON.parse(readFileSync(here('node_modules/pdfjs-dist/package.json'), 'utf8'));
const config = {
  origin: worker.origin,
  generationRevision: revisionFor(recipes),
  paperRevision: revisionFor({...recipes, pdfjsVersion, anchorVersion}),
};

const dist = here('dist');
rmSync(dist, {recursive: true, force: true});
mkdirSync(dist);

for (const path of ['reader', 'icons']) cpSync(here(path), `${dist}/${path}`, {recursive: true});
// Support the already-installed source directory and the standalone build.
const manifest = JSON.parse(readFileSync(here('manifest.json'), 'utf8').replaceAll('"dist/', '"'));
manifest.host_permissions = manifest.host_permissions.map(permission =>
  permission === `${defaultOrigin}/*` ? `${worker.protocol}//${worker.hostname}/*` : permission);
writeFileSync(`${dist}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(`${dist}/reader/config.mjs`, `export default ${JSON.stringify(config)};\n`);
for (const path of ['assets', 'lang', 'bnitz.css']) {
  cpSync(here(`../${path}`), `${dist}/${path}`, {recursive: true});
}

mkdirSync(`${dist}/vendor`);
cpSync(here('node_modules/fflate/esm/browser.js'), `${dist}/vendor/fflate.mjs`);
cpSync(here('node_modules/fflate/LICENSE'), `${dist}/vendor/fflate-LICENSE`);

mkdirSync(`${dist}/pdfjs`);
for (const path of ['LICENSE', 'cmaps', 'standard_fonts', 'wasm']) {
  cpSync(here(`node_modules/pdfjs-dist/${path}`), `${dist}/pdfjs/${path}`, {recursive: true});
}
for (const path of ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'web/pdf_viewer.mjs', 'web/pdf_viewer.css']) {
  cpSync(here(`node_modules/pdfjs-dist/${path}`), `${dist}/pdfjs/${path.split('/').at(-1)}`);
}
cpSync(here('node_modules/pdfjs-dist/web/images'), `${dist}/pdfjs/images`, {recursive: true});
