const LineStyles = (() => {
  const supports = shape => ['polyline', 'freehand', 'curve'].includes(shape?.type);

  function samples(shape) {
    if (shape.type !== 'curve') return shape.points.map(point => [...point]);
    const [a, b, c, d] = shape.points;
    if (shape.points.every(point => point[0] === a[0] && point[1] === a[1])) return Array.from({length: 65}, () => [...a]);
    return Array.from({length: 65}, (_, index) => {
      const t = index / 64, u = 1 - t;
      return [0, 1].map(axis => u ** 3 * a[axis] + 3 * u ** 2 * t * b[axis] + 3 * u * t ** 2 * c[axis] + t ** 3 * d[axis]);
    });
  }

  function zigzag(shape) {
    const normalized = samples(shape);
    const points = [];
    for (const point of normalized) {
      const world = [point[0] * shape.width, point[1] * shape.height];
      const previous = points[points.length - 1];
      if (!previous || world[0] !== previous[0] || world[1] !== previous[1]) points.push(world);
    }
    const lengths = [], cumulative = [0];
    for (let index = 1; index < points.length; index++) {
      const length = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
      lengths.push(length);
      cumulative.push(cumulative[cumulative.length - 1] + length);
    }
    const total = cumulative[cumulative.length - 1];
    if (!total) return normalized;
    const count = Math.min(512, 2 * Math.max(1, Math.round(total / 24)));
    const amplitude = Math.min(6, total / 6);
    const result = [];
    let segment = 0;
    for (let index = 0; index <= count; index++) {
      const distance = total * index / count;
      while (segment < lengths.length - 1 && distance > cumulative[segment + 1]) segment++;
      const start = points[segment], end = points[segment + 1], length = lengths[segment];
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const fraction = (distance - cumulative[segment]) / length;
      const offset = index === 0 || index === count ? 0 : amplitude * (index % 2 ? 1 : -1);
      result.push([
        (start[0] + dx * fraction - dy / length * offset) / shape.width,
        (start[1] + dy * fraction + dx / length * offset) / shape.height,
      ]);
    }
    result[0] = [...shape.points[0]];
    result[result.length - 1] = [...shape.points[shape.points.length - 1]];
    return result;
  }

  function starSegments(shape) {
    return [shape.points, [...shape.points].reverse()].flatMap((points, end) => {
      const endpoint = points[0];
      const neighbor = points.slice(1).find(point => point[0] !== endpoint[0] || point[1] !== endpoint[1]);
      const direction = neighbor
        ? Math.atan2((endpoint[1] - neighbor[1]) * shape.height, (endpoint[0] - neighbor[0]) * shape.width)
        : end === 0 ? Math.PI : 0;
      const radius = 5;
      const center = [endpoint[0] - radius * Math.cos(direction) / shape.width,
        endpoint[1] - radius * Math.sin(direction) / shape.height];
      return Array.from({length: 3}, (_, index) => {
        const angle = direction + index * Math.PI / 3;
        const dx = radius * Math.cos(angle) / shape.width, dy = radius * Math.sin(angle) / shape.height;
        return [[center[0] - dx, center[1] - dy], [center[0] + dx, center[1] + dy]];
      });
    });
  }

  return {supports, zigzag, starSegments};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LineStyles;
