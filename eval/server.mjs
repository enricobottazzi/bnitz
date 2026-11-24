import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt, randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import BNITZModel from '../lang/model.js';
import {mapRecipe} from '../extension/worker/recipes.mjs';
import {generateMap} from '../extension/worker/map.mjs';
import {arxivPaperFromUrl} from '../extension/reader/arxiv.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = dirname(directory);
const examples = JSON.parse(readFileSync(join(root, 'extension/worker/abstract-map-examples.json'), 'utf8'));
const exampleIds = examples.map(example => {
  const document = JSON.parse(readFileSync(join(root, example.readerMap), 'utf8'));
  return {input: example.input, id: arxivPaperFromUrl(document.source)?.paperId};
}).filter(example => example.id);
const defaultRecipe = mapRecipe(examples, 'lean');
const defaults = {
  models: [defaultRecipe.settings.model],
  prompts: {
    A: defaultRecipe.messages[0].content,
    B: defaultRecipe.messages[0].content + '\n\nBuild the core around one coherent contribution. Include details that define that contribution, and keep findings that make separate points outside the core.',
  },
  examples: {A: examples, B: examples},
};
const text = value => typeof value === 'string' && value.trim();
const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const clone = value => structuredClone(value);

function fail(message, status = 400) {
  throw Object.assign(new Error(message), {status});
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function save(path, value) {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(path + '.tmp', path);
}

function maps(record) {
  return record.papers.flatMap(paper => paper.pairs.flatMap(pair => [pair.left, pair.right]));
}

function summary(record, generating = false) {
  const all = maps(record);
  const scored = all.filter(map => map.map && Number.isInteger(map.score) && text(map.comment)).length;
  const complete = Boolean(record.completed_at) || scored === all.length;
  const status = complete ? 'complete' : generating ? 'generating' : all.some(map => map.error) ? 'error' : all.every(map => map.map) ? 'ready' : 'pending';
  return {id: record.id, created_at: record.created_at, status, generating, complete, scored, total: all.length};
}

function publicRun(record, generating) {
  const state = summary(record, generating);
  const publicMap = (map, revealed) => ({
    id: map.id, label: map.label, ready: Boolean(map.map), score: map.score, comment: map.comment,
    map: revealed && map.map ? {arxivId: map.map.arxivId, core: map.map.core, spans: map.map.spans} : null,
    ...(map.error ? {error: 'This map could not be generated. Retry generation.'} : {}),
    ...(state.complete ? {model: map.model, prompt: map.prompt, decision_note: map.map.decision_note} : {}),
  });
  return {...state, papers: record.papers.map(paper => ({
    source: paper.source, input: paper.input, revealed: paper.revealed, human_map: paper.human_map ?? null,
    pairs: paper.pairs.map(pair => ({id: pair.id, label: pair.label,
      left: publicMap(pair.left, paper.revealed), right: publicMap(pair.right, paper.revealed)})),
  }))};
}

function decode(value) {
  const entities = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
  }).trim();
}

async function resolvePaper(paper, fetchImpl) {
  const parsed = arxivPaperFromUrl(paper?.source?.trim().replace(/\/$/, ''));
  if (!parsed || parsed.format !== 'abs') fail('Use an arXiv abstract link for each paper.');
  const source = `https://arxiv.org/abs/${parsed.id}`;
  let {title, abstract, authors = [], affiliations = [], date = null} = paper;
  if (!text(title) || !text(abstract)) {
    const response = await fetchImpl(source, {signal: AbortSignal.timeout(20000)});
    if (!response.ok) fail('Could not load an arXiv paper. Check the links or paste its title and abstract.', 502);
    const html = await response.text();
    const fields = {};
    authors = [];
    for (const tag of html.matchAll(/<meta\s+[^>]*>/gi)) {
      const attrs = Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
        .map(([, name, double, single]) => [name.toLowerCase(), decode(double ?? single)]));
      if (attrs.name === 'citation_author') authors.push(attrs.content);
      else fields[attrs.name] = attrs.content;
    }
    title = fields.citation_title;
    abstract = fields.citation_abstract;
    date = fields.citation_date ?? null;
  }
  if (!text(title) || !text(abstract)) fail('The arXiv paper is missing a title or abstract.');
  if (![authors, affiliations].every(list => Array.isArray(list) && list.every(text)) || (date !== null && !text(date))) {
    fail('Paper metadata must contain text values.');
  }
  return {source, input: {arxivId: parsed.id, title: title.trim(), authors, affiliations, date, abstract: abstract.trim()}};
}

export function createEvalServer({runsDir = join(directory, 'runs'), apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch} = {}) {
  mkdirSync(runsDir, {recursive: true});
  const running = new Set();
  const path = (kind, id) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(id)) fail('Run not found.', 404);
    return join(runsDir, `${kind}_${id}.json`);
  };
  const load = (kind, id) => {
    try { return JSON.parse(readFileSync(path(kind, id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') fail('Run not found.', 404); throw error; }
  };
  const current = id => publicRun(load('record', id), running.has(id));

  async function prepareConfig(body, imported = false) {
    const {models, papers, prompts = defaults.prompts, examples: runExamples = defaults.examples} = body;
    if (!Array.isArray(models) || !models.length || models.some(model => !text(model)) || new Set(models).size !== models.length) {
      fail('Choose one or more distinct model IDs.');
    }
    if (!Array.isArray(papers) || !papers.length) fail('Each run needs at least one abstract.');
    if (!prompts || Object.keys(prompts).length !== 2 || !text(prompts.A) || !text(prompts.B)) fail('Provide prompts A and B.');
    if (!runExamples || Object.keys(runExamples).length !== 2) fail('Provide worked examples for A and B.');
    const allExamples = [];
    for (const key of ['A', 'B']) {
      const selected = runExamples?.[key];
      const label = `Prompt ${key}`;
      if (!Array.isArray(selected) || selected.length !== 6) fail(`${label} needs exactly six worked examples.`);
      for (const [index, example] of selected.entries()) {
        const input = example?.input;
        if (!text(input?.title) || !text(input?.abstract) ||
            ![input.authors, input.affiliations].every(list => Array.isArray(list) && list.every(text)) ||
            (input.date !== null && !text(input.date))) fail(`${label} worked example ${index + 1} needs complete input metadata.`);
        try {
          await generateMap({...input, arxivId: `example-${index + 1}`}, defaultRecipe, async () => JSON.stringify(example.output));
        } catch { fail(`${label} worked example ${index + 1} needs a valid map with verbatim highlights and a decision_note.`); }
      }
      allExamples.push(...selected);
    }
    const heldOutIds = exampleIds.filter(original => allExamples.some(example =>
      normalize(example.input.title) === normalize(original.input.title) ||
      normalize(example.input.abstract) === normalize(original.input.abstract))).map(example => example.id);
    const inputs = [];
    for (const paper of papers) {
      if (!imported) inputs.push(await resolvePaper(paper, fetchImpl));
      else {
        const parsed = arxivPaperFromUrl(paper?.source);
        const input = paper?.input;
        if (parsed?.format !== 'abs' || input?.arxivId !== parsed.id || !text(input?.title) || !text(input?.abstract) ||
            ![input.authors, input.affiliations].every(list => Array.isArray(list) && list.every(text)) ||
            (input.date !== null && !text(input.date))) fail('Imported configs must include complete paper inputs matching their arXiv links.');
        inputs.push(paper);
      }
    }
    const seen = new Set();
    for (const paper of inputs) {
      const {title, abstract, arxivId} = paper.input;
      const key = arxivId.replace(/v\d+$/, '');
      if (seen.has(key) || inputs.some(other => other !== paper && (
        normalize(other.input.title) === normalize(title) || normalize(other.input.abstract) === normalize(abstract)))) {
        fail('Choose different papers.');
      }
      seen.add(key);
      if (heldOutIds.includes(key) || allExamples.some(example => normalize(example.input.title) === normalize(title) || normalize(example.input.abstract) === normalize(abstract))) {
        fail('Test papers must be different from the worked examples.');
      }
    }
    let created_at = imported ? body.created_at : new Date().toISOString();
    if (!text(created_at) || !Number.isFinite(Date.parse(created_at)) || new Date(created_at).toISOString() !== created_at) fail('The config needs an ISO creation timestamp.');
    let id = created_at.replace(/[:.]/g, '-');
    if (imported && body.id !== id) fail('The config ID must match its creation timestamp.');
    while (!imported && existsSync(path('config', id))) {
      created_at = new Date(Date.parse(created_at) + 1).toISOString();
      id = created_at.replace(/[:.]/g, '-');
    }
    const recipes = Object.fromEntries(['A', 'B'].map(key => {
      const recipe = mapRecipe(runExamples[key], 'lean');
      recipe.messages[0].content = prompts[key];
      recipe.settings.model = models[0];
      return [key, recipe];
    }));
    if (imported) {
      if (!body.recipes || Object.keys(body.recipes).length !== 2) fail('Provide recipes A and B.');
      for (const key of ['A', 'B']) {
        const recipe = body.recipes?.[key];
        if (!recipe || !isDeepStrictEqual(recipe.messages, recipes[key].messages) ||
            !recipe.settings || typeof recipe.settings !== 'object' || Array.isArray(recipe.settings) ||
            !models.includes(recipe.settings.model) || !Number.isInteger(recipe.attempts) || recipe.attempts < 1 ||
            !Number.isSafeInteger(recipe.timeout) || recipe.timeout < 1 || !text(recipe.retryPrompt)) {
          fail(`Prompt ${key} recipe must match its prompt, examples, and run models.`);
        }
      }
      const {A, B} = body.recipes;
      if (!isDeepStrictEqual(A.settings, B.settings) || A.attempts !== B.attempts || A.timeout !== B.timeout || A.retryPrompt !== B.retryPrompt) {
        fail('Both recipes must use the same generation settings and retry policy.');
      }
      return clone(body);
    }
    return {id, created_at, models, papers: inputs, prompts: {...prompts}, examples: clone(runExamples), recipes};
  }

  function initializeRecord(config) {
    const {id, created_at, models, papers} = config;
    const record = {id, created_at, papers: papers.map(paper => ({...paper, revealed: false,
      pairs: shuffle(models).map((model, index) => {
        const sides = shuffle(['A', 'B']).map((prompt, side) => ({
          id: randomUUID(), label: String.fromCharCode(65 + index * 2 + side), model, prompt,
          map: null, score: null, comment: '', attempts: [], error: null,
        }));
        return {id: randomUUID(), label: `Pair ${index + 1}`, left: sides[0], right: sides[1]};
      }),
    }))};
    save(path('record', id), record);
    return publicRun(record, false);
  }

  async function createRun(body) {
    const config = await prepareConfig(body);
    save(path('config', config.id), config);
    return initializeRecord(config);
  }

  async function importRun(body) {
    const configPath = path('config', body?.id);
    if (existsSync(configPath) && !isDeepStrictEqual(load('config', body.id), body)) fail('A different config already exists for this run.', 409);
    if (existsSync(path('record', body.id))) {
      if (!existsSync(configPath)) fail('This run already has a record without a matching config.', 409);
      return current(body.id);
    }
    if (!body.prompts || !body.examples || !body.recipes) fail('Import a complete run config.');
    const config = await prepareConfig(body, true);
    // Another import may have completed while local validation was awaited.
    if (existsSync(configPath) && !isDeepStrictEqual(load('config', config.id), config)) fail('A different config already exists for this run.', 409);
    if (existsSync(path('record', config.id))) return current(config.id);
    if (!existsSync(configPath)) save(configPath, config);
    return initializeRecord(config);
  }

  async function generate(id, generationKey) {
    const config = load('config', id);
    try {
      for (let paperIndex = 0; paperIndex < config.papers.length; paperIndex++) {
        const ids = load('record', id).papers[paperIndex].pairs.flatMap(pair => [pair.left.id, pair.right.id]);
        for (const mapId of ids) {
          const entry = maps(load('record', id)).find(map => map.id === mapId);
          if (entry.map) continue;
          const recipe = clone(config.recipes[entry.prompt]);
          recipe.settings.model = entry.model;
          const attempts = [];
          let map = null, error = null;
          try {
            map = await generateMap(config.papers[paperIndex].input, recipe, async (payload, timeout) => {
              const attempt = {request: clone(payload), started_at: new Date().toISOString()};
              attempts.push(attempt);
              const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST', headers: {Authorization: `Bearer ${generationKey}`, 'Content-Type': 'application/json'},
                body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout),
              });
              const result = await response.json();
              attempt.response = JSON.parse(JSON.stringify(result).replaceAll(JSON.stringify(generationKey).slice(1, -1), '[redacted]'));
              if (!response.ok || result.error) throw new Error(result.error?.message || `Model request failed (${response.status}).`);
              return attempt.response.choices?.[0]?.message?.content;
            });
          } catch (failure) { error = failure.message.replaceAll(generationKey, '[redacted]'); }
          // Re-read so feedback submitted during generation is preserved.
          const record = load('record', id);
          const saved = maps(record).find(item => item.id === mapId);
          Object.assign(saved, {map, error, attempts: [...saved.attempts, ...attempts]});
          save(path('record', id), record);
        }
      }
    } finally { running.delete(id); }
  }

  async function bodyOf(request) {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) fail('Request is too large.', 413);
    }
    try { return JSON.parse(body || '{}'); } catch { fail('Send a JSON request.'); }
  }

  return createServer(async (request, response) => {
    const send = (value, status = 200, headers = {}) => {
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
      response.end(JSON.stringify(value));
    };
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (request.method === 'POST' && request.headers.origin && request.headers.origin !== url.origin) fail('Use the local eval page.', 403);
      if (request.method === 'GET' && url.pathname === '/api/defaults') return send(defaults);
      if (request.method === 'GET' && url.pathname === '/api/runs') {
        const records = readdirSync(runsDir).filter(name => /^record_.*\.json$/.test(name)).sort().reverse()
          .map(name => JSON.parse(readFileSync(join(runsDir, name), 'utf8')));
        return send(records.map(record => summary(record, running.has(record.id))));
      }
      if (request.method === 'POST' && url.pathname === '/api/runs') return send(await createRun(await bodyOf(request)), 201);
      if (request.method === 'POST' && url.pathname === '/api/runs/import') return send(await importRun(await bodyOf(request)));
      const route = /^\/api\/runs\/([^/]+)(?:\/(generate|feedback|export))?$/.exec(url.pathname);
      if (route) {
        const [, id, action] = route;
        if (request.method === 'GET' && !action) return send(current(id));
        if (request.method === 'POST' && action === 'generate') {
          load('record', id);
          const generationKey = text((await bodyOf(request))?.apiKey) || apiKey;
          if (!generationKey) fail('Paste your OpenRouter key before generating maps.');
          if (!running.has(id)) {
            running.add(id);
            generate(id, generationKey).catch(error => console.error(`Run ${id}: ${error.message.replaceAll(generationKey, '[redacted]')}`));
          }
          return send(current(id), 202);
        }
        if (request.method === 'POST' && action === 'feedback') {
          const body = await bodyOf(request);
          const record = load('record', id);
          const paper = record.papers[body.paper];
          if (!Number.isInteger(body.paper) || !paper) fail('Choose a paper in this run.');
          if (body.human_map !== undefined) {
            try { BNITZModel.validate(body.human_map); }
            catch (error) { fail(error.message); }
            if (body.human_map.text !== paper.input.abstract) fail('The imported map must use this paper’s exact abstract.');
            paper.human_map = body.human_map;
          }
          if (body.revealed === true) {
            if (paper.pairs.some(pair => !pair.left.map || !pair.right.map)) fail('Generate both maps in every pair before revealing.');
            paper.revealed = true;
          }
          if (body.mapId !== undefined) {
            if (!paper.revealed) fail('Reveal this paper before scoring.');
            const map = paper.pairs.flatMap(pair => [pair.left, pair.right]).find(item => item.id === body.mapId);
            if (!map) fail('Map not found.');
            if (body.score !== undefined) {
              if (!Number.isInteger(body.score) || body.score < 1 || body.score > 5) fail('Choose a score from 1 to 5.');
              map.score = body.score;
            }
            if (body.comment !== undefined) {
              if (typeof body.comment !== 'string') fail('Comments must be text.');
              map.comment = body.comment;
            }
          }
          if (!record.completed_at && summary(record).complete) record.completed_at = new Date().toISOString();
          save(path('record', id), record);
          return send(publicRun(record, running.has(id)));
        }
        if (request.method === 'GET' && action === 'export') {
          const record = load('record', id);
          return send({...record, config: load('config', id)}, 200, {'Content-Disposition': `attachment; filename="record_${id}.json"`});
        }
      }
      if (request.method !== 'GET') fail('Endpoint not found.', 404);
      let file;
      if (url.pathname === '/' || url.pathname === '/eval' || url.pathname === '/eval/') file = join(directory, 'index.html');
      else if (/^\/eval\/(app\.js|style\.css)$/.test(url.pathname)) file = join(root, url.pathname.slice(1));
      else if (/^\/lang\/(model|view)\.js$/.test(url.pathname) || url.pathname === '/vendor/katex.min.js' || /^\/assets\/[\w-]+\.svg$/.test(url.pathname)) file = join(root, url.pathname.slice(1));
      if (!file) fail('Page not found.', 404);
      const content = readFileSync(file);
      const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'};
      response.writeHead(200, {'Content-Type': `${types[extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store'});
      response.end(content);
    } catch (error) { send({error: error.code === 'ENOENT' ? 'Page not found.' : error.message}, error.status || (error.code === 'ENOENT' ? 404 : 500)); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4174);
  createEvalServer().listen(port, '127.0.0.1', () => console.log(`BNITZ eval: http://127.0.0.1:${port}/eval/`));
}
