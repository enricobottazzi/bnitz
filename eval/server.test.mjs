import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {test} from 'node:test';
import {createEvalServer} from './server.mjs';
import {mapRecipe} from '../extension/worker/recipes.mjs';

const examples = JSON.parse(readFileSync(new URL('../extension/worker/abstract-map-examples.json', import.meta.url), 'utf8'));
const papers = Array.from({length: 5}, (_, index) => ({
  source: `https://arxiv.org/abs/2611.9000${index}v1`,
  title: `Evaluation paper ${index}`,
  abstract: `Experiment ${index} establishes a new result.`,
}));
const entries = run => run.papers.flatMap(paper => paper.pairs.flatMap(pair => [pair.left, pair.right]));
const order = run => run.papers.map(paper => paper.pairs.map(pair => [pair.id, pair.left.id, pair.right.id]));

async function request(server, method, url, body) {
  const incoming = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(incoming, {method, url, headers: {host: '127.0.0.1:4174'}});
  let status, result;
  await server.listeners('request')[0](incoming, {
    writeHead(value) { status = value; },
    end(value) { result = JSON.parse(value); },
  });
  return {status, body: result};
}

function setup(t, fetchImpl) {
  const runsDir = mkdtempSync(join(tmpdir(), 'bnitz-eval-'));
  t.after(() => rmSync(runsDir, {recursive: true, force: true}));
  const open = () => createEvalServer({runsDir, apiKey: 'test-key', fetchImpl});
  const server = open();
  return {runsDir, open, server, send: (method, url, body) => request(server, method, url, body)};
}

function answer(payload) {
  const {abstract} = JSON.parse(payload.messages.at(-1).content);
  return Response.json({choices: [{message: {content: JSON.stringify({
    planets: [{id: 'core', parent: '', relation: 'core', highlights: [abstract]}],
    decision_note: 'The reported result states the main contribution.',
  })}}]});
}

async function finished(send, id) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const {body} = await send('GET', `/api/runs/${id}`);
    if (!body.generating) return body;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Mock generation did not finish.');
}

async function importConfig(send) {
  const {body: defaults} = await send('GET', '/api/defaults');
  const models = ['test/model'];
  const recipes = Object.fromEntries(['A', 'B'].map(key => {
    const recipe = mapRecipe(defaults.examples[key], 'lean');
    recipe.messages[0].content = defaults.prompts[key];
    recipe.settings.model = models[0];
    recipe.settings.max_tokens = 4321;
    recipe.settings.response_format.json_schema.name = 'frozen_import_schema';
    recipe.attempts = 3;
    recipe.timeout = 12345;
    recipe.retryPrompt = 'Correct this imported map.';
    return [key, recipe];
  }));
  return {
    id: '2026-11-24T14-26-15-562Z', created_at: '2026-11-24T14:26:15.562Z', models,
    papers: papers.map(({source, ...paper}) => ({source, input: {
      arxivId: source.split('/abs/')[1], ...paper, authors: [], affiliations: [], date: null,
    }})),
    prompts: defaults.prompts, examples: defaults.examples, recipes,
  };
}

test('importing a prepared config initializes only its record and resumes unchanged', async t => {
  const requests = [];
  const {send, runsDir} = setup(t, async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return answer(payload);
  });
  const config = await importConfig(send);
  const configPath = join(runsDir, `config_${config.id}.json`);
  const original = JSON.stringify(config, null, 4) + '\n';
  writeFileSync(configPath, original);
  const {status, body: run} = await send('POST', '/api/runs/import', config);
  assert.equal(status, 200);
  assert.equal(run.id, config.id);
  assert.equal(run.created_at, config.created_at);
  assert.equal(run.status, 'pending');
  assert.equal(requests.length, 0);
  assert.equal(readFileSync(configPath, 'utf8'), original);
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
  const runUrl = `/api/runs/${run.id}`;
  await send('POST', `${runUrl}/generate`);
  assert.equal((await finished(send, run.id)).status, 'ready');
  assert.equal(requests.length, 10);
  for (const payload of requests) {
    assert.equal(payload.max_tokens, 4321);
    assert.equal(payload.response_format.json_schema.name, 'frozen_import_schema');
    assert.ok(['A', 'B'].some(key => payload.messages[0].content === config.prompts[key]));
  }
  await send('POST', `${runUrl}/feedback`, {paper: 0, revealed: true});
  await send('POST', `${runUrl}/feedback`, {paper: 0, mapId: run.papers[0].pairs[0].left.id, score: 4, comment: 'Keep this feedback.'});
  const recordPath = join(runsDir, `record_${run.id}.json`);
  const saved = readFileSync(recordPath, 'utf8');
  const {body: resumed} = await send('POST', '/api/runs/import', config);
  assert.deepEqual(order(resumed), order(run));
  assert.equal(resumed.papers[0].pairs[0].left.score, 4);
  assert.equal(resumed.papers[0].pairs[0].left.comment, 'Keep this feedback.');
  assert.equal(readFileSync(recordPath, 'utf8'), saved);
  const conflict = structuredClone(config);
  conflict.prompts.B += '\nA different prompt.';
  conflict.recipes.B.messages[0].content = conflict.prompts.B;
  assert.equal((await send('POST', '/api/runs/import', conflict)).status, 409);
  assert.equal(readFileSync(recordPath, 'utf8'), saved);
  assert.equal(readFileSync(configPath, 'utf8'), original);
});

test('external configs import with A/B metadata and inconsistent snapshots are rejected without writes', async t => {
  const {send, runsDir} = setup(t, () => assert.fail('Import must not use the network.'));
  const config = await importConfig(send);
  for (const mutate of [
    value => { value.recipes.B.settings.max_tokens++; },
    value => { value.recipes.A.messages[0].content = 'Different from the saved prompt.'; },
    value => { delete value.papers[0].input.abstract; },
  ]) {
    const invalid = structuredClone(config);
    mutate(invalid);
    assert.equal((await send('POST', '/api/runs/import', invalid)).status, 400);
    assert.deepEqual(readdirSync(runsDir), []);
  }
  assert.equal((await send('POST', '/api/runs/import', config)).status, 200);
  const savedConfig = JSON.parse(readFileSync(join(runsDir, `config_${config.id}.json`), 'utf8'));
  const savedRecord = JSON.parse(readFileSync(join(runsDir, `record_${config.id}.json`), 'utf8'));
  assert.deepEqual(savedConfig, config);
  assert.deepEqual(Object.keys(savedConfig.prompts), ['A', 'B']);
  assert.deepEqual(Object.keys(savedConfig.recipes), ['A', 'B']);
  assert.ok(entries(savedRecord).every(entry => entry.prompt === 'A' || entry.prompt === 'B'));
});

test('a human map imports before Reveal, survives restart and export, and rejects invalid replacements', async t => {
  const {send, runsDir, open} = setup(t, () => assert.fail('Importing a human map must not generate anything.'));
  const {body: run} = await send('POST', '/api/runs', {models: ['test/model'], papers});
  const runUrl = `/api/runs/${run.id}`;
  const humanMap = {
    version: 3, title: 'My reading of the abstract', text: papers[0].abstract, core: 'my-core',
    spans: [{id: 'my-core', start: 0, end: papers[0].abstract.length,
      highlights: [{start: 0, end: papers[0].abstract.length}]}],
  };
  const {status, body: saved} = await send('POST', `${runUrl}/feedback`, {paper: 0, human_map: humanMap});
  assert.equal(status, 200);
  assert.deepEqual(saved.papers[0].human_map, humanMap);
  assert.equal(saved.papers[0].revealed, false);
  assert.equal(saved.scored, 0);
  assert.equal(saved.complete, false);
  assert.deepEqual(order(saved), order(run));
  assert.deepEqual((await request(open(), 'GET', runUrl)).body.papers[0].human_map, humanMap);
  assert.deepEqual((await send('GET', `${runUrl}/export`)).body.papers[0].human_map, humanMap);
  const recordPath = join(runsDir, `record_${run.id}.json`);
  const before = readFileSync(recordPath, 'utf8');
  for (const invalid of [{...humanMap, core: 'missing-core'}, {...humanMap, text: humanMap.text + ' Another sentence.'}]) {
    assert.equal((await send('POST', `${runUrl}/feedback`, {paper: 0, human_map: invalid})).status, 400);
    assert.equal(readFileSync(recordPath, 'utf8'), before);
  }
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
});

test('run creation snapshots both prompts and excludes worked examples', async t => {
  const {send, runsDir} = setup(t, () => assert.fail('Paper inputs must avoid network calls.'));
  const {body: defaults} = await send('GET', '/api/defaults');
  assert.deepEqual(defaults.examples, {A: examples, B: examples});
  assert.deepEqual(Object.keys(defaults.prompts), ['A', 'B']);
  const heldOut = {...papers[0], title: examples[0].input.title};
  const rejected = await send('POST', '/api/runs', {models: ['test/model'], papers: [heldOut, ...papers.slice(1)]});
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /worked examples/);
  assert.deepEqual(readdirSync(runsDir), []);

  const {status, body: run} = await send('POST', '/api/runs', {models: ['test/model'], papers});
  assert.equal(status, 201);
  assert.equal(run.total, 10);
  const config = JSON.parse(readFileSync(join(runsDir, `config_${run.id}.json`), 'utf8'));
  assert.deepEqual(config.prompts, defaults.prompts);
  assert.deepEqual(config.examples, defaults.examples);
  assert.deepEqual(config.recipes.A.settings, config.recipes.B.settings);
  assert.deepEqual(config.recipes.A.messages.slice(1), config.recipes.B.messages.slice(1));
  assert.equal(config.recipes.A.messages.length, 13);
  assert.equal(config.recipes.B.messages[0].content, defaults.prompts.B);
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
});

test('each prompt receives only its own edited examples, preserving their metadata', async t => {
  const requests = [];
  const {send, runsDir} = setup(t, async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return answer(payload);
  });
  const edited = {A: structuredClone(examples), B: structuredClone(examples)};
  for (const key of ['A', 'B']) edited[key][0] = {
    readerMap: `examples/${key}-replacement.bnitz`,
    input: {title: `A ${key} worked example`, abstract: `We prove the ${key} example theorem.`, authors: [], affiliations: [], date: null},
    output: {planets: [{id: 'c', parent: '', relation: 'core', highlights: [`We prove the ${key} example theorem.`]}], decision_note: 'The theorem is the contribution.'},
  };
  const prompts = {A: 'Map using examples A.', B: 'Map using examples B.'};
  const {status, body: run} = await send('POST', '/api/runs', {models: ['test/model'], papers, examples: edited, prompts});
  assert.equal(status, 201);
  const config = JSON.parse(readFileSync(join(runsDir, `config_${run.id}.json`), 'utf8'));
  assert.deepEqual(config.examples, edited);
  assert.notDeepEqual(config.recipes.A.messages.slice(1), config.recipes.B.messages.slice(1));
  await send('POST', `/api/runs/${run.id}/generate`);
  assert.equal((await finished(send, run.id)).status, 'ready');
  assert.equal(requests.length, 10);
  for (const payload of requests) {
    const key = Object.keys(config.prompts).find(key => config.prompts[key] === payload.messages[0].content);
    for (let index = 0; index < edited[key].length; index++) {
      assert.deepEqual(JSON.parse(payload.messages[1 + index * 2].content), edited[key][index].input);
      assert.deepEqual(JSON.parse(payload.messages[2 + index * 2].content), edited[key][index].output);
    }
  }
});

test('invalid or overlapping custom examples are rejected before run files are written', async t => {
  const {send, runsDir} = setup(t, () => assert.fail('Example validation must not call a model.'));
  const custom = {A: structuredClone(examples), B: structuredClone(examples)};
  const invalidMap = structuredClone(custom);
  invalidMap.B[0].output.planets[0].highlights = ['An excerpt absent from this abstract.'];
  const overlapA = structuredClone(custom);
  const overlapB = structuredClone(custom);
  const overlappingExample = {
    input: {title: papers[0].title, abstract: papers[0].abstract, authors: [], affiliations: [], date: null},
    output: {planets: [{id: 'c', parent: '', relation: 'core', highlights: [papers[0].abstract]}], decision_note: 'The reported result is the contribution.'},
  };
  overlapA.A[0] = overlappingExample;
  overlapB.B[0] = overlappingExample;
  for (const values of [
    {...custom, A: custom.A.slice(1)},
    {...custom, B: [null, ...custom.B.slice(1)]},
    invalidMap, overlapA, overlapB,
  ]) {
    const result = await send('POST', '/api/runs', {models: ['test/model'], papers, examples: values});
    assert.equal(result.status, 400);
    assert.match(result.body.error, /[Ww]orked example/);
    assert.deepEqual(readdirSync(runsDir), []);
  }
});

test('five-paper run stays blind until every map has a score and comment, then exports complete provenance', async t => {
  const requests = [];
  const {send, open, runsDir} = setup(t, async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return answer(payload);
  });
  const {body: run} = await send('POST', '/api/runs', {models: ['test/model-one', 'test/model-two'], papers});
  const runUrl = `/api/runs/${run.id}`;
  assert.equal((await send('POST', `${runUrl}/feedback`, {paper: 0, revealed: true})).status, 400);
  await send('POST', `${runUrl}/generate`);
  const generated = await finished(send, run.id);
  assert.equal(generated.status, 'ready');
  assert.equal(requests.length, 20);
  assert.ok(entries(generated).every(entry => entry.map === null && !('model' in entry) && !('prompt' in entry)));
  for (let paper = 0; paper < 5; paper++) await send('POST', `${runUrl}/feedback`, {paper, revealed: true});
  const {body: revealed} = await send('GET', runUrl);
  assert.ok(entries(revealed).every(entry => entry.map && !('decision_note' in entry) && !('model' in entry) && !('prompt' in entry)));
  assert.deepEqual(order((await request(open(), 'GET', runUrl)).body), order(run));

  const config = JSON.parse(readFileSync(join(runsDir, `config_${run.id}.json`), 'utf8'));
  for (const payload of requests) {
    const prompt = Object.keys(config.prompts).find(key => config.prompts[key] === payload.messages[0].content);
    assert.ok(prompt);
    assert.deepEqual(payload.messages.slice(0, -1), config.recipes[prompt].messages);
    assert.deepEqual({...payload, model: config.recipes[prompt].settings.model, messages: undefined}, {
      ...config.recipes[prompt].settings, messages: undefined,
    });
    assert.equal(payload.max_tokens, 6000);
    assert.equal(payload.reasoning.effort, 'low');
    assert.ok(!('temperature' in payload) && !('top_p' in payload));
    const input = JSON.parse(payload.messages.at(-1).content);
    assert.ok(config.papers.some(paper => JSON.stringify({...paper.input, arxivId: undefined}) === JSON.stringify({...input, arxivId: undefined})));
  }
  for (let paper = 0; paper < 5; paper++) {
    for (const entry of revealed.papers[paper].pairs.flatMap(pair => [pair.left, pair.right])) {
      const isLast = entry.id === entries(revealed).at(-1).id;
      await send('POST', `${runUrl}/feedback`, {paper, mapId: entry.id, score: 4, comment: isLast ? '  ' : 'Clear contribution.'});
    }
  }
  const {body: incomplete} = await send('GET', runUrl);
  assert.equal(incomplete.complete, false);
  assert.ok(entries(incomplete).every(entry => !('model' in entry) && !('prompt' in entry)));
  const {body: complete} = await send('POST', `${runUrl}/feedback`, {
    paper: 4, mapId: entries(revealed).at(-1).id, comment: 'Clear contribution.',
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.scored, 20);
  assert.ok(entries(complete).every(entry => entry.model && entry.prompt && entry.decision_note));
  const {body: exported} = await send('GET', `${runUrl}/export`);
  assert.deepEqual(exported.config, config);
  assert.equal(exported.papers.length, 5);
  for (const paper of exported.papers) {
    assert.ok(paper.source && paper.input.abstract);
    for (const entry of paper.pairs.flatMap(pair => [pair.left, pair.right])) {
      assert.ok(entry.model && entry.prompt && entry.label && entry.map.decision_note);
      assert.equal(entry.attempts.length, 1);
      assert.ok(entry.attempts[0].request && entry.attempts[0].response);
      assert.equal(entry.score, 4);
      assert.equal(entry.comment, 'Clear contribution.');
    }
  }
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
});

test('a ten-paper import stays blind through the final map and persists the complete batch', async t => {
  const requests = [];
  const {send, open, runsDir} = setup(t, async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return answer(payload);
  });
  const config = await importConfig(send);
  config.papers = Array.from({length: 10}, (_, index) => ({
    source: `https://arxiv.org/abs/2611.8000${index}v1`,
    input: {arxivId: `2611.8000${index}v1`, title: `Ten-paper evaluation ${index}`,
      abstract: `Result ${index} establishes this contribution.`, authors: [], affiliations: [], date: null},
  }));
  assert.equal((await send('POST', '/api/runs/import', {...config, papers: []})).status, 400);
  const duplicate = {...config, papers: [...config.papers.slice(0, 9), config.papers[0]]};
  const rejected = await send('POST', '/api/runs/import', duplicate);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error, 'Choose different papers.');
  assert.deepEqual(readdirSync(runsDir), []);
  const {status, body: run} = await send('POST', '/api/runs/import', config);
  assert.equal(status, 200);
  assert.equal(run.papers.length, 10);
  assert.equal(run.total, 20);
  assert.equal(requests.length, 0);
  const runUrl = `/api/runs/${run.id}`;
  await send('POST', `${runUrl}/generate`);
  const generated = await finished(send, run.id);
  assert.equal(generated.status, 'ready');
  assert.equal(requests.length, 20);
  assert.ok(entries(generated).every(entry => entry.map === null && !entry.model && !entry.prompt));
  let current;
  for (let paper = 0; paper < 10; paper++) {
    const {body: revealed} = await send('POST', `${runUrl}/feedback`, {paper, revealed: true});
    current = revealed;
    if (paper < 9) for (const entry of entries({papers: [revealed.papers[paper]]})) {
      current = (await send('POST', `${runUrl}/feedback`, {paper, mapId: entry.id, score: 4, comment: 'Clear contribution.'})).body;
    }
  }
  assert.equal(current.scored, 18);
  assert.equal(current.complete, false);
  assert.ok(entries(current).every(entry => !entry.model && !entry.prompt));
  const [left, right] = entries({papers: [current.papers[9]]});
  current = (await send('POST', `${runUrl}/feedback`, {paper: 9, mapId: left.id, score: 5, comment: 'Clear final abstract.'})).body;
  current = (await send('POST', `${runUrl}/feedback`, {paper: 9, mapId: right.id, score: 4})).body;
  assert.equal(current.scored, 19);
  assert.equal(current.complete, false);
  assert.ok(entries(current).every(entry => !entry.model && !entry.prompt));
  current = (await send('POST', `${runUrl}/feedback`, {paper: 9, mapId: right.id, comment: 'Final comment.'})).body;
  assert.equal(current.scored, 20);
  assert.equal(current.complete, true);
  assert.ok(entries(current).every(entry => entry.model && ['A', 'B'].includes(entry.prompt)));
  const resumed = (await request(open(), 'GET', runUrl)).body;
  assert.deepEqual(resumed, current);
  assert.deepEqual(order(resumed), order(run));
  const exported = (await send('GET', `${runUrl}/export`)).body;
  assert.equal(exported.papers.length, 10);
  assert.equal(exported.papers[9].pairs[0].right.comment, 'Final comment.');
  assert.deepEqual(exported.config, config);
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
});

test('retry generates only missing maps and retains feedback submitted during generation', async t => {
  let release, pause;
  const blocked = new Promise(resolve => { pause = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  let count = 0;
  const {send, runsDir} = setup(t, async (_url, options) => {
    count++;
    if (count === 3) {
      pause();
      await gate;
      return Response.json({error: {message: 'Temporary provider error.'}}, {status: 503});
    }
    return answer(JSON.parse(options.body));
  });
  const {body: run} = await send('POST', '/api/runs', {models: ['test/model'], papers});
  const runUrl = `/api/runs/${run.id}`;
  await send('POST', `${runUrl}/generate`);
  await blocked;
  await send('POST', `${runUrl}/feedback`, {paper: 0, revealed: true});
  const entry = run.papers[0].pairs[0].left;
  assert.equal((await send('POST', `${runUrl}/feedback`, {paper: 0, mapId: entry.id, score: 5, comment: 'Saved while generating.'})).status, 200);
  release();
  const partial = await finished(send, run.id);
  assert.equal(partial.status, 'error');
  assert.equal(count, 10);
  const saved = entries(partial).find(item => item.id === entry.id);
  assert.equal(saved.score, 5);
  assert.equal(saved.comment, 'Saved while generating.');
  const before = JSON.parse(readFileSync(join(runsDir, `record_${run.id}.json`), 'utf8'));
  const failed = entries(before).find(item => item.error);
  assert.ok(failed);
  const successes = entries(before).filter(item => item.map);

  await send('POST', `${runUrl}/generate`);
  const retried = await finished(send, run.id);
  assert.equal(retried.status, 'ready');
  assert.equal(count, 11);
  assert.deepEqual(order(retried), order(run));
  const after = JSON.parse(readFileSync(join(runsDir, `record_${run.id}.json`), 'utf8'));
  for (const previous of successes) assert.deepEqual(entries(after).find(item => item.id === previous.id), previous);
  assert.equal(entries(after).find(item => item.id === failed.id).attempts.length, 2);
  assert.deepEqual(readdirSync(runsDir).sort(), [`config_${run.id}.json`, `record_${run.id}.json`]);
});

test('a key pasted for generation is used only for authorization and is never saved or returned', async t => {
  const runsDir = mkdtempSync(join(tmpdir(), 'bnitz-eval-key-'));
  t.after(() => rmSync(runsDir, {recursive: true, force: true}));
  const apiKey = 'sk-test-pasted-only-for-this-run';
  let calls = 0;
  const server = createEvalServer({runsDir, apiKey: null, fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    assert.ok(!options.body.includes(apiKey));
    const response = await answer(JSON.parse(options.body)).json();
    response.debug = apiKey; // Even an echoed credential must stay out of saved traces.
    return Response.json(response);
  }});
  const send = (method, url, body) => request(server, method, url, body);
  const {body: run} = await send('POST', '/api/runs', {models: ['test/model'], papers});
  const runUrl = `/api/runs/${run.id}`;
  const missing = await send('POST', `${runUrl}/generate`, {});
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'Paste your OpenRouter key before generating maps.');
  assert.equal(calls, 0);
  assert.equal((await send('POST', `${runUrl}/generate`, {apiKey: `  ${apiKey}  `})).status, 202);
  const generated = await finished(send, run.id);
  assert.equal(generated.status, 'ready');
  assert.equal(calls, 10);
  const outputs = [
    generated,
    (await send('GET', '/api/defaults')).body,
    (await send('GET', '/api/runs')).body,
    (await send('GET', `${runUrl}/export`)).body,
  ];
  assert.ok(!JSON.stringify(outputs).includes(apiKey));
  for (const name of readdirSync(runsDir)) assert.ok(!readFileSync(join(runsDir, name), 'utf8').includes(apiKey));
});
