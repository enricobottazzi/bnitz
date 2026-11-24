import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import worker from './index.mjs';
import {mapRecipe} from './recipes.mjs';
import {openPaperCache} from './cache.mjs';
import {recipes} from '../worker-dist/recipe.mjs';

const paper = {
  arxivId: '2601.00001v1',
  title: 'Evaluation of a measurement method',
  abstract: 'The method improves accuracy.',
  authors: [],
  affiliations: [],
  date: null,
  body: [{id: 'b1', text: 'Accuracy rose by five points.'}],
};
const abstractOnly = {...paper, body: []};
const abstractMap = {
  planets: [{id: 'root', parent: '', relation: 'core', highlights: [paper.abstract]}],
  decision_note: 'The gain in accuracy is the core because it is the only finding reported.',
};
const bodyMap = {
  passages: [{planetId: 'root', block: 'b1', highlight: paper.body[0].text}],
};
const documentedErrors = readFileSync(new URL('../ERRORS.md', import.meta.url), 'utf8').split(/\r?\n/);

function setup(t, replies, {withinQuota = true} = {}) {
  const entries = new Map();
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    GENERATION_RATE: {limit: async () => ({success: withinQuota})},
    GENERATION_CACHE: {
      getWithMetadata: async key => entries.get(key) ?? {},
      put: async (key, value, {metadata}) => entries.set(key, {value: JSON.parse(value), metadata}),
    },
  };
  const queue = replies.values();
  const model = t.mock.method(globalThis, 'fetch', async () => {
    const reply = queue.next().value;
    assert.notEqual(reply, undefined, 'Unexpected model call');
    if (reply instanceof Response) return reply;
    return Response.json({choices: [{message: {content: JSON.stringify(reply)}}]});
  });
  const send = (input = paper) => worker.fetch(new Request('https://bnitz.test/v1/paper-map', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input),
  }), env);
  return {send, model: model.mock, entries};
}

test('Worker sends six abstract examples to GPT-6 Luna with the selected prompt', async t => {
  const examples = JSON.parse(readFileSync(new URL('./abstract-map-examples.json', import.meta.url), 'utf8'));
  assert.equal(examples.length, 6);
  assert.ok(examples.some(example => example.input.title.startsWith('DeepSeek-R1:')));
  const recipe = mapRecipe(examples, 'lean');
  const {send, model} = setup(t, [abstractMap]);
  assert.equal((await send(abstractOnly)).status, 200);

  const request = JSON.parse(model.calls[0].arguments[1].body);
  assert.equal(request.model, 'openai/gpt-6-luna');
  assert.equal(request.response_format.json_schema.schema.properties.planets.items.properties.relation.enum[0], 'core');
  assert.deepEqual(request.messages.slice(0, -1), recipe.messages);
  assert.equal(JSON.parse(request.messages.at(-1).content).abstract, paper.abstract);
});

const noPlanets = {...abstractMap, planets: []};
const missingNote = {planets: abstractMap.planets};
const blankNote = {...abstractMap, decision_note: ' '};
const unmatchedPassage = {passages: [{...bodyMap.passages[0], highlight: 'Absent from the paper.'}]};

for (const [reason, status, input, replies] of [
  ['invalid abstract map after retry', 502, abstractOnly, [noPlanets, noPlanets]],
  ['missing then blank decision note', 502, abstractOnly, [missingNote, blankNote]],
  ['body provider failure', 502, paper, [abstractMap, Response.json({}, {status: 503})]],
  ['unmatched body passage', 502, paper, [abstractMap, unmatchedPassage]],
  ['empty abstract', 400, {...paper, abstract: ''}, []],
  ['oversized request', 413, {...paper, abstract: 'A'.repeat(1024 * 1024)}, []],
  ['rate limit', 429, paper, []],
]) {
  test(`${reason} returns HTTP ${status} without caching`, async t => {
    const {send, model, entries} = setup(t, replies, {withinQuota: status !== 429});
    const response = await send(input);
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(result, {error: result.error});
    const row = `| \`${status}\` | ${result.error} |`;
    assert.ok(documentedErrors.includes(row), `ERRORS.md is missing ${row}`);
    assert.equal(model.callCount(), replies.length);
    assert.equal(entries.size, 0);
  });
}

test('an empty passage list is a valid result', async t => {
  const {send, entries} = setup(t, [abstractMap, {passages: []}]);
  const response = await send();
  assert.equal(response.status, 200);
  const map = await response.json();
  assert.deepEqual(map.spans.flatMap(span => span.highlights.map(range => range.section)), ['abstract']);
  assert.equal(entries.size, 1);
});

test('decision notes survive cache hits, and only requests for a note upgrade a map-only entry', async t => {
  const nextNote = 'The “accuracy” result is the paper’s core.';
  const {send, model, entries} = setup(t, [abstractMap, {...abstractMap, decision_note: nextNote}]);
  const withNote = {...abstractOnly, includeDecisionNote: true};
  const map = await (await send(abstractOnly)).json();
  assert.equal(map.version, '3arxiv');
  assert.equal(Object.hasOwn(map, 'decision_note'), false);
  const hit = await send(withNote);
  assert.equal(hit.headers.get('BNITZ-Cache'), 'HIT');
  assert.deepEqual(await hit.json(), {map, decision_note: abstractMap.decision_note});

  const entry = entries.values().next().value;
  entry.value = map;
  const plainHit = await send(abstractOnly);
  assert.equal(plainHit.headers.get('BNITZ-Cache'), 'HIT');
  assert.deepEqual(await plainHit.json(), map);
  assert.equal(model.callCount(), 1);

  const regenerated = await send(withNote);
  assert.equal(regenerated.headers.get('BNITZ-Cache'), 'MISS');
  assert.deepEqual(await regenerated.json(), {map, decision_note: nextNote});
  const repeat = await send(withNote);
  assert.equal(repeat.headers.get('BNITZ-Cache'), 'HIT');
  assert.deepEqual(await repeat.json(), {map, decision_note: nextNote});
  assert.equal(model.callCount(), 2);
});

test('Cache reuse requires the same revision, abstract, and body', async t => {
  const replies = Array(4).fill([abstractMap, bodyMap]).flat();
  const {send, model} = setup(t, replies);

  const first = await send();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('BNITZ-Cache'), 'MISS');
  assert.equal(model.callCount(), 2);
  const firstMap = await first.json();
  assert.equal(firstMap.core, 'root');
  assert.deepEqual(firstMap.spans[0].highlights.map(range => range.section), ['abstract', 'body']);
  const bodyRequest = JSON.parse(model.calls[1].arguments[1].body);
  assert.equal(bodyRequest.model, 'google/gemini-4-carbon');
  assert.equal(JSON.parse(bodyRequest.messages.at(-1).content).planets[0].relation, 'core');

  const repeat = await send();
  assert.equal(repeat.headers.get('BNITZ-Cache'), 'HIT');
  assert.deepEqual(await repeat.json(), firstMap);
  assert.equal(model.callCount(), 2);

  const revised = {...paper, arxivId: '2601.00001v2'};
  const changedAbstract = {...revised, abstract: `${paper.abstract} This was assessed experimentally.`};
  const changedBody = {...changedAbstract, body: [{...paper.body[0], text: `${paper.body[0].text} We ran three trials.`}]};

  for (const input of [revised, changedAbstract, changedBody]) {
    const previousCalls = model.callCount();
    const response = await send(input);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('BNITZ-Cache'), 'MISS');
    assert.equal((await response.json()).arxivId, input.arxivId);
    assert.equal(model.callCount(), previousCalls + 2);
  }
});

test('Cache reuse requires unchanged models, prompts, examples, and generation settings', async t => {
  const {entries} = setup(t, []);
  const namespace = {
    getWithMetadata: async key => entries.get(key) ?? {},
    put: async (key, value, {metadata}) => entries.set(key, {value: JSON.parse(value), metadata}),
  };
  const text = {arxivId: paper.arxivId, abstract: paper.abstract, body: paper.body[0].text};
  const cache = await openPaperCache(namespace, text, recipes);
  await cache.put({core: 'root'});
  assert.deepEqual(await (await openPaperCache(namespace, text, structuredClone(recipes))).get(), {core: 'root'});

  for (const change of [
    value => { value.abstract.settings.model = 'another-model'; },
    value => { value.abstract.messages[0].content += ' Updated prompt.'; },
    value => { value.abstract.messages[1].content += ' Updated example.'; },
    value => { value.abstract.settings.max_tokens += 1; },
    value => { value.body.settings.model = 'another-body-model'; },
  ]) {
    const changed = structuredClone(recipes);
    change(changed);
    assert.equal(await (await openPaperCache(namespace, text, changed)).get(), null);
  }
});
