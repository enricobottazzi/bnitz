const test = require('node:test');
const assert = require('node:assert/strict');
const MapGrid = require('../grid.js');

const base = {x: 81, y: 43, width: 168, height: 84, rotation: 0};
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
function anchor(shape) {
  const angle = shape.rotation * Math.PI / 180;
  return {
    x: shape.x + shape.width / 2 - Math.cos(angle) * shape.width / 2 + Math.sin(angle) * shape.height / 2,
    y: shape.y + shape.height / 2 - Math.sin(angle) * shape.width / 2 - Math.cos(angle) * shape.height / 2,
  };
}
function pointerAtFactor(shape, factor, perpendicular = 0) {
  const start = anchor(shape), angle = shape.rotation * Math.PI / 180;
  const dx = Math.cos(angle) * shape.width - Math.sin(angle) * shape.height;
  const dy = Math.sin(angle) * shape.width + Math.cos(angle) * shape.height;
  return {x: start.x + factor * dx - perpendicular * dy, y: start.y + factor * dy + perpendicular * dx};
}

test('snap uses a 28-unit grid, including negative coordinates', () => {
  assert.equal(MapGrid.step, 28);
  assert.equal(MapGrid.snap(43), 56);
  assert.equal(MapGrid.snap(41), 28);
  assert.equal(MapGrid.snap(-43), -56);
});

test('circle positioning snaps centers for odd, even, and small diameters', () => {
  for (const [diameter, x, y] of [[28, 14, 42], [56, 0, 56], [84, 14, 42], [112, 0, 56], [14, 21, 49]]) {
    const shape = {type: 'ellipse', x: 10, y: 43, width: diameter, height: diameter};
    assert.deepEqual(MapGrid.position(shape), {x, y});
    assert.equal(shape.x, 10);
    assert.equal(shape.y, 43);
  }
});

test('position uses requested movement offsets and preserves legacy ellipse dimensions', () => {
  const circle = {type: 'ellipse', x: 42, y: 14, width: 84, height: 84};
  assert.deepEqual(MapGrid.position(circle, circle.x + 16, circle.y - 44), {x: 70, y: -42});
  const legacy = {type: 'ellipse', x: 20, y: 10, width: 75, height: 39, rotation: 45};
  assert.deepEqual(MapGrid.position(legacy), {x: 18.5, y: 8.5});
  assert.equal(legacy.width, 75);
  assert.equal(legacy.height, 39);
  assert.deepEqual(MapGrid.position({...legacy, type: 'polygon'}), {x: 28, y: 0});
});

test('circle resizing keeps its grid center through odd and even size steps', () => {
  for (const rotation of [0, 45, 90, 137]) {
    const shape = {type: 'ellipse', x: 42, y: 14, width: 84, height: 84, rotation};
    for (const size of [28, 56, 84, 112, 196]) {
      const result = MapGrid.resize(shape, size);
      assert.equal(result.width, size);
      assert.equal(result.height, size);
      close(result.x + result.width / 2, 84);
      close(result.y + result.height / 2, 56);
    }
    const bigger = {...shape, ...MapGrid.stepSize(shape, 1)};
    const restored = MapGrid.stepSize(bigger, -1);
    for (const key of ['x', 'y', 'width', 'height']) close(restored[key], shape[key]);
  }
});

test('legacy ellipse resizing snaps its center once and retains its aspect at minimum size', () => {
  const shape = {type: 'ellipse', x: 20, y: 10, width: 75, height: 39, rotation: 37};
  const minimum = {...shape, ...MapGrid.resize(shape, -100)};
  assert.equal(minimum.width, 28);
  close(minimum.height / minimum.width, 39 / 75);
  close(minimum.x + minimum.width / 2, 56);
  close(minimum.y + minimum.height / 2, 28);
  const bigger = {...minimum, ...MapGrid.stepSize(minimum, 1)};
  close(bigger.x + bigger.width / 2, 56);
  close(bigger.y + bigger.height / 2, 28);
  assert.equal(MapGrid.stepSize(minimum, -1).width, 28);
});

test('ellipse pointer resize projects from the original center at any rotation', () => {
  for (const rotation of [0, 45, 90, 137, -65]) {
    for (const shape of [
      {type: 'ellipse', x: 0, y: 28, width: 112, height: 112, rotation},
      {type: 'ellipse', x: 20, y: 10, width: 75, height: 39, rotation},
    ]) {
      const angle = rotation * Math.PI / 180;
      const dx = Math.cos(angle) * shape.width - Math.sin(angle) * shape.height;
      const dy = Math.sin(angle) * shape.width + Math.cos(angle) * shape.height;
      const factor = 168 / Math.max(shape.width, shape.height);
      const pointer = {
        x: shape.x + shape.width / 2 + factor * dx / 2 - .6 * dy,
        y: shape.y + shape.height / 2 + factor * dy / 2 + .6 * dx,
      };
      const actual = MapGrid.resizeFromPointer(shape, pointer);
      const expected = MapGrid.resize(shape, 168);
      for (const key of ['x', 'y', 'width', 'height']) close(actual[key], expected[key]);
    }
  }
});

test('resize snaps the largest dimension while preserving either aspect ratio', () => {
  for (const shape of [base, {...base, width: 84, height: 168}]) {
    const original = {...shape};
    const result = MapGrid.resize(shape, 205);
    assert.equal(Math.max(result.width, result.height), 196);
    close(result.width / result.height, shape.width / shape.height);
    assert.deepEqual(shape, original);
  }
});

test('resize keeps the rotated top-left world anchor fixed', () => {
  for (const rotation of [0, 30, 90, 137, -65, 270]) {
    const shape = {...base, rotation};
    const before = anchor(shape);
    const after = anchor({...shape, ...MapGrid.resize(shape, 310)});
    close(after.x, before.x);
    close(after.y, before.y);
  }
});

test('exact resizing accepts decimal grid sizes while preserving aspect and rotated anchors', () => {
  for (const shape of [{...base, rotation: 37}, {...base, width: 84, height: 168, rotation: -65}]) {
    const before = anchor(shape);
    for (const units of [2.25, .5]) {
      const result = MapGrid.resize(shape, units * MapGrid.step, false);
      assert.equal(Math.max(result.width, result.height), units * MapGrid.step);
      close(result.width / result.height, shape.width / shape.height);
      close(anchor({...shape, ...result}).x, before.x);
      close(anchor({...shape, ...result}).y, before.y);
    }
  }
  assert.equal(MapGrid.resize(base, 2.25 * MapGrid.step).width, 56);
  assert.equal(MapGrid.resize(base, .5 * MapGrid.step).width, 28);
});

test('exact ellipse sizing keeps the center on its nearest grid dot', () => {
  const shape = {type: 'ellipse', x: 20, y: 10, width: 75, height: 39, rotation: 45};
  for (const units of [2.25, .5]) {
    const result = MapGrid.resize(shape, units * MapGrid.step, false);
    assert.equal(result.width, units * MapGrid.step);
    close(result.height / result.width, 39 / 75);
    close(result.x + result.width / 2, 56);
    close(result.y + result.height / 2, 28);
  }
});

test('exact resizing clamps finite extremes and safely ignores invalid sizes', () => {
  for (const desired of [-100, 0, 1]) {
    const result = MapGrid.resize(base, desired, false);
    assert.equal(result.width, MapGrid.step / 10);
    close(result.height, MapGrid.step / 20);
  }
  assert.equal(MapGrid.resize(base, 200000, false).width, 98000);
  for (const desired of [NaN, Infinity, -Infinity, undefined]) {
    const result = MapGrid.resize(base, desired, false);
    for (const key of ['x', 'y', 'width', 'height']) close(result[key], base[key]);
  }
});

test('plus and minus are inverse steps for grid-sized shapes', () => {
  const shape = {...base, rotation: 37};
  const bigger = {...shape, ...MapGrid.stepSize(shape, 1)};
  assert.equal(bigger.width, 196);
  const restored = MapGrid.stepSize(bigger, -1);
  for (const key of ['x', 'y', 'width', 'height']) close(restored[key], shape[key]);
  assert.equal(MapGrid.stepSize(shape, -1).width, 140);
});

test('off-grid imports step to the adjacent grid multiples', () => {
  const shape = {...base, width: 174, height: 106};
  assert.equal(MapGrid.stepSize(shape, 1).width, 196);
  assert.equal(MapGrid.stepSize(shape, -1).width, 168);
  close(MapGrid.stepSize(shape, -1).height / 168, 106 / 174);
});

test('minimum and maximum sizes retain proportions and anchor', () => {
  const shape = {...base, rotation: 123};
  const minimum = {...shape, ...MapGrid.resize(shape, -100)};
  assert.equal(minimum.width, 28);
  assert.equal(minimum.height, 14);
  assert.equal(MapGrid.stepSize(minimum, -1).width, 28);
  assert.equal(MapGrid.resize(shape, 200000).width, 98000);
  close(anchor(minimum).x, anchor(shape).x);
  close(anchor(minimum).y, anchor(shape).y);
});

test('pointer resize projects onto the rotated diagonal and ignores perpendicular drift', () => {
  const shape = {...base, rotation: 61};
  const expected = MapGrid.resize(shape, 252);
  const actual = MapGrid.resizeFromPointer(shape, pointerAtFactor(shape, 1.5, .6));
  for (const key of ['x', 'y', 'width', 'height']) close(actual[key], expected[key]);
});

test('pointer motion smaller than half a grid step leaves size unchanged', () => {
  const shape = {...base, rotation: -28};
  for (const delta of [-13, 13]) {
    const result = MapGrid.resizeFromPointer(shape, pointerAtFactor(shape, (168 + delta) / 168));
    for (const key of ['x', 'y', 'width', 'height']) close(result[key], shape[key]);
  }
  assert.equal(MapGrid.resizeFromPointer(shape, pointerAtFactor(shape, 183 / 168)).width, 196);
});

test('repeated resize cycles remain numerically stable', () => {
  const initial = {...base, height: 103, rotation: 43};
  let shape = {...initial};
  for (let index = 0; index < 10000; index++) {
    shape = {...shape, ...MapGrid.stepSize(shape, 1)};
    shape = {...shape, ...MapGrid.stepSize(shape, -1)};
  }
  for (const key of ['x', 'y', 'width', 'height']) close(shape[key], initial[key], 1e-7);
});
