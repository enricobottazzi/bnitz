import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const tokenFile = process.argv[2] ?? join(homedir(), 'Desktop', 'TOKEN.md');
const tokens = readFileSync(tokenFile, 'utf8');
const openRouterKey = /^(?:[-*#]+\s*)?`*BNITZ_OPENROUTER`*\s*[:=]\s*[`'"]*(sk-or-v1-[\w-]+)/m
  .exec(tokens)?.[1];
if (!openRouterKey) throw new Error('The BNITZ_OPENROUTER entry is missing from TOKEN.md.');

let cacheConfig = null;
const cacheUrl = process.env.BNITZ_CACHE_URL ??
  /^(?:[-*#]+\s*)?`*BNITZ_CACHE_URL`*\s*[:=]\s*[`'"]*([^\s`'"]+)/m.exec(tokens)?.[1];
if (cacheUrl) {
  const endpoint = new URL(cacheUrl);
  const local = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname);
  if ((!local && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('BNITZ_CACHE_URL must be the HTTPS origin of the cache Worker, or a local test origin.');
  }
  const token = /^(?:[-*#]+\s*)?`*BNITZ_CACHE_TOKEN`*\s*[:=]\s*[`'"]*([\w-]+)/m.exec(tokens)?.[1];
  if (!token) throw new Error('The BNITZ_CACHE_TOKEN entry is missing from TOKEN.md.');
  cacheConfig = {url: endpoint.origin, token};
}

const dist = here('dist');
rmSync(dist, {recursive: true, force: true});
mkdirSync(dist);

for (const path of ['reader', 'icons']) cpSync(here(path), `${dist}/${path}`, {recursive: true});
// Support the already-installed source directory and the standalone build.
const manifest = JSON.parse(readFileSync(here('manifest.json'), 'utf8').replaceAll('"dist/', '"'));
if (cacheConfig) {
  const {protocol, hostname} = new URL(cacheConfig.url);
  manifest.host_permissions.push(`${protocol}//${hostname}/*`);
}
writeFileSync(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));
writeFileSync(`${dist}/reader/local-key`, openRouterKey, {mode: 0o600});
writeFileSync(`${dist}/reader/cache-config.json`, JSON.stringify(cacheConfig), {mode: 0o600});
for (const path of ['assets', 'lang', 'bnitz.css', 'RULES.md']) {
  cpSync(here(`../${path}`), `${dist}/${path}`, {recursive: true});
}

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
