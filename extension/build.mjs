import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const defaultOrigin = 'https://bnitz-routing-0-2-3.enricobottazzi.workers.dev';
const worker = new URL(process.env.BNITZ_WORKER_ORIGIN ?? defaultOrigin);
const localWorker = worker.protocol === 'http:' && worker.hostname === '127.0.0.1';
if ((!localWorker && worker.protocol !== 'https:') ||
    worker.pathname !== '/' || worker.search || worker.hash || worker.username || worker.password) {
  throw new Error('BNITZ_WORKER_ORIGIN must be an HTTPS origin or http://127.0.0.1 for local development.');
}

const dist = here('dist');
rmSync(dist, {recursive: true, force: true});
mkdirSync(dist);

for (const path of ['reader', 'icons']) cpSync(here(path), `${dist}/${path}`, {recursive: true});
// Support the already-installed source directory and the standalone build.
const manifest = JSON.parse(readFileSync(here('manifest.json'), 'utf8').replaceAll('"dist/', '"'));
manifest.host_permissions = manifest.host_permissions.map(permission =>
  permission === `${defaultOrigin}/*` ? `${worker.protocol}//${worker.hostname}/*` : permission);
writeFileSync(`${dist}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(`${dist}/reader/config.mjs`, `export default ${JSON.stringify({origin: worker.origin})};\n`);
for (const path of ['assets', 'lang', 'bnitz.css']) {
  cpSync(here(`../${path}`), `${dist}/${path}`, {recursive: true});
}
