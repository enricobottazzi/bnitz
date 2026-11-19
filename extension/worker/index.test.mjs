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
const abstractMap = {
  planets: [{id: 'root', parent: '', relation: 'nucleus', highlights: [paper.abstract]}],
  decision_note: 'The gain in accuracy is the nucleus because it is the only finding reported.',
};
const bodyMap = {
  passages: [{planetId: 'root', block: 'b1', highlight: paper.body[0].text}],
};
const modelReply = content => Response.json({choices: [{message: {content: JSON.stringify(content)}}]});

const errorReference = readFileSync(new URL('../ERRORS.md', import.meta.url), 'utf8');
const documentedErrors = new Set(errorReference.split(/\r?\n/));

async function assertDocumentedError(response, status) {
  assert.equal(response.status, status);
  const result = await response.json();
  assert.equal(typeof result?.error, 'string');
  assert.deepEqual(result, {error: result.error});
  const row = `| \`${status}\` | ${result.error} |`;
  assert.ok(documentedErrors.has(row), `ERRORS.md is missing HTTP ${status}: ${result.error}`);
}

function setup(t, replies = [], {withinQuota = true} = {}) {
  const entries = new Map();
  const env = {
    OPENROUTER_API_KEY: 'test-key',
    GENERATION_RATE: {limit: async () => ({success: withinQuota})},
    GENERATION_CACHE: {
      getWithMetadata: async key => entries.get(key) ?? {},
      put: async (key, value, {metadata}) => entries.set(key, {value: JSON.parse(value), metadata}),
    },
  };
  const model = t.mock.method(globalThis, 'fetch', async () => {
    const response = replies.shift();
    if (!response) throw new Error('Unexpected model call');
    return response;
  });
  const send = (input = paper) => worker.fetch(new Request('https://bnitz.test/v1/paper-map', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input),
  }), env);
  return {send, model: model.mock, entries};
}

test('Worker sends the evaluated Gemini Lean-6 abstract recipe', async t => {
  const examples = JSON.parse(readFileSync(new URL('./abstract-map-examples.json', import.meta.url), 'utf8'));
  const recipe = mapRecipe(examples.slice(0, 6), 'lean');
  const {send, model} = setup(t, [modelReply(abstractMap)]);
  assert.equal((await send({...paper, body: []})).status, 200);

  const request = JSON.parse(model.calls[0].arguments[1].body);
  assert.equal(request.model, 'google/gemini-4-carbon');
  assert.deepEqual(request.messages.slice(0, -1), recipe.messages);
  assert.equal(JSON.parse(request.messages.at(-1).content).abstract, paper.abstract);
});

test('Generation failure', async t => {
  await t.test('an invalid abstract map returns an error without caching after one retry', async t => {
    const invalid = () => modelReply({...abstractMap, planets: []});
    const {send, model, entries} = setup(t, [invalid(), invalid()]);

    await assertDocumentedError(await send(), 502);
    assert.equal(model.callCount(), 2);
    assert.equal(entries.size, 0);
  });

  await t.test('a missing or blank abstract decision note requires a retry', async t => {
    const {send, model, entries} = setup(t, [
      modelReply({planets: abstractMap.planets}), modelReply({...abstractMap, decision_note: ' '}),
    ]);
    await assertDocumentedError(await send(), 502);
    assert.equal(model.callCount(), 2);
    assert.equal(entries.size, 0);
  });

  for (const [name, reply] of [
    ['a body provider failure', Response.json({}, {status: 503})],
    ['a reply with only invalid body passages', modelReply({
      passages: [{planetId: 'root', block: 'b1', highlight: 'A sentence absent from the paper.'}],
    })],
  ]) {
    await t.test(`${name} returns an error without caching`, async t => {
      const {send, entries} = setup(t, [modelReply(abstractMap), reply]);

      await assertDocumentedError(await send(), 502);
      assert.equal(entries.size, 0);
    });
  }

  await t.test('an empty passage list is a valid result', async t => {
    const {send, entries} = setup(t, [modelReply(abstractMap), modelReply({passages: []})]);

    const response = await send();
    assert.equal(response.status, 200);
    const map = await response.json();
    assert.deepEqual(map.spans.flatMap(span => span.highlights.map(range => range.section)), ['abstract']);
    assert.equal(entries.size, 1);
  });
});

test('Cache reuse requires the same revision, abstract, and body', async t => {
  const replies = Array.from({length: 4}, () => [modelReply(abstractMap), modelReply(bodyMap)]).flat();
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

test('Worker limits reject requests before a model call', async t => {
  for (const {name, input, status} of [
    {name: 'invalid', input: {...paper, abstract: ''}, status: 400},
    {name: 'oversized', input: {...paper, abstract: 'A'.repeat(1024 * 1024)}, status: 413},
    {name: 'over quota', input: paper, status: 429},
  ]) {
    await t.test(name, async t => {
      const {send, model} = setup(t, [], {withinQuota: status !== 429});

      await assertDocumentedError(await send(input), status);
      assert.equal(model.callCount(), 0);
    });
  }
});
