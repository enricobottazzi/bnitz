const test = require('node:test');
const assert = require('node:assert/strict');
const LineStyles = require('../line-style.js');

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const line = {type: 'polyline', width: 96, height: 48, points: [[0, 0], [1, 0]]};
function world(shape, point) {
  const angle = (shape.rotation || 0) * Math.PI / 180;
  const x = (point[0] - .5) * shape.width, y = (point[1] - .5) * shape.height;
  return [(shape.x || 0) + shape.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    (shape.y || 0) + shape.height / 2 + x * Math.sin(angle) + y * Math.cos(angle)];
}

test('only line, freehand, and curve forms support line styles', () => {
  for (const type of ['polyline', 'freehand', 'curve']) assert.equal(LineStyles.supports({type}), true);
  for (const type of ['ellipse', 'polygon', 'path', 'text', 'arrow', 'box']) assert.equal(LineStyles.supports({type}), false);
  assert.equal(LineStyles.supports(null), false);
});

test('zigzags retain exact endpoints and alternate by six world units with unequal dimensions', () => {
  const original = JSON.parse(JSON.stringify(line));
  const points = LineStyles.zigzag(line);
  assert.equal(points.length, 9);
  assert.deepEqual(points[0], line.points[0]);
  assert.deepEqual(points.at(-1), line.points.at(-1));
  for (let index = 1; index < points.length - 1; index++) {
    close(points[index][0] * line.width, index * 12);
    close(points[index][1] * line.height, index % 2 ? 6 : -6);
  }
  assert.deepEqual(line, original);
});

test('rotation preserves the zigzag amplitude perpendicular to its line', () => {
  for (const rotation of [45, 90, 137, -65]) {
    const shape = {...line, x: 37, y: -12, rotation};
    const start = world(shape, shape.points[0]), end = world(shape, shape.points[1]);
    const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
    const points = LineStyles.zigzag(shape);
    for (let index = 1; index < points.length - 1; index++) {
      const point = world(shape, points[index]);
      close((dx * (point[1] - start[1]) - dy * (point[0] - start[0])) / length, index % 2 ? 6 : -6);
    }
  }
});

test('proportional scaling adds waves without inflating their world amplitude', () => {
  const larger = {...line, width: 192, height: 96};
  const points = LineStyles.zigzag(larger);
  assert.equal(points.length, 17);
  for (const point of points.slice(1, -1)) close(Math.abs(point[1] * larger.height), 6);
  assert.deepEqual(points[0], line.points[0]);
  assert.deepEqual(points.at(-1), line.points.at(-1));
  assert.equal(LineStyles.zigzag({...line, width: 100000}).length, 513);
});

test('short and duplicate-point lines remain finite and preserve their endpoints', () => {
  const short = {...line, width: 6};
  const points = LineStyles.zigzag(short);
  assert.equal(points.length, 3);
  close(points[1][0] * short.width, 3);
  close(points[1][1] * short.height, 1);
  const duplicate = {...line, type: 'freehand', points: [[0, 0], [0, 0], [1, 0], [1, 0]]};
  assert.deepEqual(LineStyles.zigzag(duplicate), LineStyles.zigzag(line));
  const stationary = {...line, points: [[.2, .3], [.2, .3], [.2, .3]]};
  assert.deepEqual(LineStyles.zigzag(stationary), stationary.points);
});

test('curved zigzags follow the bow and preserve true endpoints rather than control points', () => {
  const shape = {type: 'curve', width: 120, height: 60, points: [[0, 1], [0, 0], [1, 0], [1, 1]]};
  const points = LineStyles.zigzag(shape);
  assert.deepEqual(points[0], [0, 1]);
  assert.deepEqual(points.at(-1), [1, 1]);
  assert.ok(Math.min(...points.map(point => point[1])) < .4);
  assert.ok(points.every(point => point.every(Number.isFinite)));
  const loop = {...shape, points: [[0, 1], [0, 0], [1, 0], [0, 1]]};
  const loopPoints = LineStyles.zigzag(loop);
  assert.ok(loopPoints.length > 3);
  assert.deepEqual(loopPoints[0], loopPoints.at(-1));
});

test('a stationary cubic retains its 65 original normalized samples without roundoff waves', () => {
  const shape = {type: 'curve', width: 120, height: 60, points: Array.from({length: 4}, () => [.2, .3])};
  const points = LineStyles.zigzag(shape);
  assert.equal(points.length, 65);
  for (const point of points) assert.deepEqual(point, [.2, .3]);
});

test('small asterisks align with the line and stay inside its ends after scaling and rotation', () => {
  for (const scale of [.5, 1, 3]) {
    const shape = {...line, points: [[0, 0], [1, 1]], width: line.width * scale, height: line.height * scale, rotation: 61};
    const original = JSON.parse(JSON.stringify(shape));
    const segments = LineStyles.starSegments(shape);
    assert.equal(segments.length, 6);
    segments.forEach((segment, index) => {
      const endIndex = index < 3 ? 0 : 1;
      const endpoint = world(shape, shape.points[endIndex]), neighbor = world(shape, shape.points[1 - endIndex]);
      const dx = endpoint[0] - neighbor[0], dy = endpoint[1] - neighbor[1], length = Math.hypot(dx, dy);
      const axis = [dx / length, dy / length];
      const center = [endpoint[0] - 5 * axis[0], endpoint[1] - 5 * axis[1]];
      const ends = segment.map(point => world(shape, point));
      close((ends[0][0] + ends[1][0]) / 2, center[0]);
      close((ends[0][1] + ends[1][1]) / 2, center[1]);
      for (const point of ends) {
        close(Math.hypot(point[0] - center[0], point[1] - center[1]), 5);
        assert.ok((point[0] - endpoint[0]) * axis[0] + (point[1] - endpoint[1]) * axis[1] <= 1e-9);
      }
      if (index % 3 === 0) {
        close(ends[1][0], endpoint[0]);
        close(ends[1][1], endpoint[1]);
      }
    });
    assert.deepEqual(shape, original);
  }
});

test('curve asterisks follow endpoint tangents with duplicate control-point fallbacks', () => {
  for (const points of [
    [[0, 1], [0, 0], [1, 0], [1, 1]],
    [[0, 1], [0, 1], [1, 0], [1, 1]],
    [[0, 1], [0, 0], [1, 1], [1, 1]],
  ]) {
    const shape = {type: 'curve', width: 160, height: 40, points};
    const segments = LineStyles.starSegments(shape);
    for (const index of [0, 1]) {
      const endpoint = points[index ? 3 : 0], segment = segments[index * 3];
      const candidates = index ? points.slice(0, -1).reverse() : points.slice(1);
      const neighbor = candidates.find(p => p[0] !== endpoint[0] || p[1] !== endpoint[1]);
      const dx = (endpoint[0] - neighbor[0]) * shape.width, dy = (endpoint[1] - neighbor[1]) * shape.height;
      const length = Math.hypot(dx, dy);
      close(segment[1][0], endpoint[0]);
      close(segment[1][1], endpoint[1]);
      close((segment[1][0] - segment[0][0]) * shape.width, 10 * dx / length);
      close((segment[1][1] - segment[0][1]) * shape.height, 10 * dy / length);
    }
  }
  const still = {type: 'curve', width: 160, height: 40, points: Array.from({length: 4}, () => [.2, .3])};
  assert.ok(LineStyles.starSegments(still).flat(2).every(Number.isFinite));
});
