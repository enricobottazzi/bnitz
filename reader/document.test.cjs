const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, readdirSync} = require('node:fs');
const {join} = require('node:path');
const model = require('../lang/model.js');

function paper(text = 'Before planet after', start = 7, end = 13) {
  return {version: 3, title: 'Test', text, nucleus: 's1', spans: [
    {id: 's1', start, end, highlights: [{start, end}]},
  ]};
}

test('text edits shift a planet and its highlights without mutating the imported document', () => {
  const original = paper();
  const edited = model.editText(original, 'New Before planet after');
  assert.equal(edited.text.slice(edited.spans[0].start, edited.spans[0].end), 'planet');
  assert.deepEqual(edited.spans[0].highlights, [{start: 11, end: 17}]);
  assert.deepEqual(original, paper());
  assert.equal(model.validate(edited), edited);
});

test('insertions beside a passage stay outside it; insertions within it extend it', () => {
  for (const text of ['Before new planet after', 'Before planet new after', 'Before planXXXet after']) {
    const edited = model.editText(paper(), text);
    const {start, end} = edited.spans[0];
    assert.equal(text.slice(start, end), text.includes('XXX') ? 'planXXXet' : 'planet');
    model.validate(edited);
  }
});

test('replacing a passage keeps its planet and follows the replacement', () => {
  const edited = model.editText(paper(), 'Before moon after');
  assert.deepEqual(edited.spans[0].highlights, [{start: 7, end: 11}]);
  assert.equal(edited.text.slice(edited.spans[0].start, edited.spans[0].end), 'moon');
  model.validate(edited);
});

test('deleted passages cannot be exported until repaired, without losing the planet', () => {
  const edited = model.editText(paper(), 'Before  after');
  assert.equal(edited.spans[0].id, 's1');
  assert.deepEqual(edited.spans[0].highlights, []);
  assert.throws(() => model.validate(edited), /passage/);
});

test('another surviving highlight can anchor a planet after its first passage is deleted', () => {
  const original = paper();
  original.spans[0].highlights.push({start: 14, end: 19});
  const edited = model.editText(original, 'Before  after');
  assert.equal(edited.text.slice(edited.spans[0].start, edited.spans[0].end), 'after');
  assert.deepEqual(edited.spans[0].highlights, [{start: 8, end: 13}]);
  model.validate(edited);
});

test('emoji replacements keep valid UTF-16 boundaries', () => {
  const edited = model.editText(paper('A 🙂 B', 2, 4), 'A 🙃 B');
  assert.deepEqual(edited.spans[0].highlights, [{start: 2, end: 4}]);
  model.validate(edited);
});

test('the textarea selection disambiguates edits in repeated text', () => {
  const original = paper('planet planet', 0, 6);
  const appended = model.editText(original, 'planet planet planet', {start: 13, end: 13});
  assert.deepEqual(appended.spans[0].highlights, [{start: 0, end: 6}]);
  const prepended = model.editText(original, 'planet planet planet', {start: 0, end: 0});
  assert.deepEqual(prepended.spans[0].highlights, [{start: 7, end: 13}]);
});

test('forward Delete preserves the preceding planet in repeated text', () => {
  const edited = model.editText(paper('aaaa', 0, 1), 'aaa', {start: 1, end: 1, inputType: 'deleteContentForward'});
  assert.deepEqual(edited.spans[0].highlights, [{start: 0, end: 1}]);
  model.validate(edited);
});

test('Backspace shifts the following planet in repeated text', () => {
  const edited = model.editText(paper('aaaa', 1, 2), 'aaa', {start: 1, end: 1, inputType: 'deleteContentBackward'});
  assert.deepEqual(edited.spans[0].highlights, [{start: 0, end: 1}]);
  model.validate(edited);
});

test('word and line deletion preserve earlier passages', () => {
  for (const inputType of ['deleteWordBackward', 'deleteSoftLineBackward', 'deleteHardLineBackward']) {
    const edited = model.editText(paper('aaaaaa', 0, 1), 'aaaa', {start: 4, end: 4, inputType});
    assert.deepEqual(edited.spans[0].highlights, [{start: 0, end: 1}]);
    model.validate(edited);
  }
});

test('forward and backward emoji deletion keep UTF-16 passage boundaries', () => {
  for (const [caret, inputType] of [[2, 'deleteContentForward'], [4, 'deleteContentBackward']]) {
    const edited = model.editText(paper('🙂🙂🙂', 0, 2), '🙂🙂', {start: caret, end: caret, inputType});
    assert.deepEqual(edited.spans[0].highlights, [{start: 0, end: 2}]);
    model.validate(edited);
  }
});

test('successive edits track independent passages and preserve extra metadata', () => {
  let edited = {...paper(), author: 'Author', source: 'https://example.com', custom: {note: 'Keep'}};
  edited = model.editText(edited, 'New Before planet after');
  edited = model.editText(edited, 'New Before planet ending');
  assert.equal(edited.text.slice(edited.spans[0].start, edited.spans[0].end), 'planet');
  assert.deepEqual(edited.custom, {note: 'Keep'});
  assert.equal(edited.source, 'https://example.com');
  model.validate(edited);
});

test('every published v3 file survives import, text insertion, and export validation', () => {
  for (const name of readdirSync(join(__dirname, '../examples')).filter(name => name.endsWith('.bnitz'))) {
    const imported = model.validate(JSON.parse(readFileSync(join(__dirname, '../examples', name), 'utf8')));
    const edited = model.editText(imported, 'Added text. ' + imported.text);
    const exported = model.validate(JSON.parse(JSON.stringify(edited)));
    assert.equal(exported.spans.length, imported.spans.length, name);
    for (const [index, span] of imported.spans.entries()) {
      const next = exported.spans[index];
      assert.equal(exported.text.slice(next.start, next.end), imported.text.slice(span.start, span.end), name);
    }
  }
});
