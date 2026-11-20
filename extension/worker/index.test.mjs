import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import worker from './index.mjs';
import {mapRecipe} from './recipes.mjs';

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
  planets: [{id: 'root', parent: '', relation: 'nucleus', highlights: [paper.abstract]}],
  decision_note: 'The gain in accuracy is the nucleus because it is the only finding reported.',
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

test('Worker sends six lean abstract examples including the reviewed DeepSeek-R1 map', async t => {
  const examples = JSON.parse(readFileSync(new URL('./abstract-map-examples.json', import.meta.url), 'utf8'));
  assert.equal(examples.length, 6);
  assert.ok(examples.some(example => example.input.title.startsWith('DeepSeek-R1:')));
  const recipe = mapRecipe(examples, 'lean');
  const {send, model} = setup(t, [abstractMap]);
  assert.equal((await send(abstractOnly)).status, 200);

  const request = JSON.parse(model.calls[0].arguments[1].body);
  assert.equal(request.model, 'google/gemini-4-carbon');
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

test('Cache reuse requires the same revision, abstract, and body', async t => {
  const replies = Array(4).fill([abstractMap, bodyMap]).flat();
  const {send, model} = setup(t, replies);

  const first = await send();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('BNITZ-Cache'), 'MISS');
  assert.equal(model.callCount(), 2);
  const firstMap = await first.json();
  assert.deepEqual(firstMap.spans[0].highlights.map(range => range.section), ['abstract', 'body']);

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
