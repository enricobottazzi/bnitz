const MapGrid = (() => {
  const step = 28;
  const maximum = 98000;
  const snap = value => Math.round(value / step) * step;

  function position(shape, x = shape.x, y = shape.y) {
    if (shape.type === 'ellipse') {
      return {x: snap(x + shape.width / 2) - shape.width / 2, y: snap(y + shape.height / 2) - shape.height / 2};
    }
    return {x: snap(x), y: snap(y)};
  }

  function geometry(shape) {
    const angle = (shape.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = cos * shape.width - sin * shape.height;
    const dy = sin * shape.width + cos * shape.height;
    return {
      dx, dy,
      x: shape.x + shape.width / 2 - dx / 2,
      y: shape.y + shape.height / 2 - dy / 2,
    };
  }

  function resize(shape, desiredLargestDimension, snapToGrid = true) {
    const largest = Math.max(shape.width, shape.height);
    const desired = Number.isFinite(desiredLargestDimension) ? desiredLargestDimension : largest;
    const size = Math.min(maximum, Math.max(snapToGrid ? step : step / 10, snapToGrid ? snap(desired) : desired));
    const factor = size / largest;
    const width = shape.width >= shape.height ? size : shape.width * factor;
    const height = shape.height >= shape.width ? size : shape.height * factor;
    if (shape.type === 'ellipse') {
      return {
        x: snap(shape.x + shape.width / 2) - width / 2,
        y: snap(shape.y + shape.height / 2) - height / 2,
        width, height,
      };
    }
    const anchor = geometry(shape);
    return {
      x: anchor.x - width / 2 + anchor.dx * factor / 2,
      y: anchor.y - height / 2 + anchor.dy * factor / 2,
      width, height,
    };
  }

  function stepSize(shape, direction) {
    const units = Math.max(shape.width, shape.height) / step;
    const next = direction > 0 ? Math.floor(units + 1e-10) + 1 : Math.ceil(units - 1e-10) - 1;
    return resize(shape, next * step);
  }

  function resizeFromPointer(shape, pointer) {
    const anchor = geometry(shape);
    if (shape.type === 'ellipse') {
      const centerX = shape.x + shape.width / 2, centerY = shape.y + shape.height / 2;
      const factor = 2 * ((pointer.x - centerX) * anchor.dx + (pointer.y - centerY) * anchor.dy)
        / (anchor.dx * anchor.dx + anchor.dy * anchor.dy);
      return resize(shape, Math.max(shape.width, shape.height) * factor);
    }
    const factor = ((pointer.x - anchor.x) * anchor.dx + (pointer.y - anchor.y) * anchor.dy)
      / (anchor.dx * anchor.dx + anchor.dy * anchor.dy);
    return resize(shape, Math.max(shape.width, shape.height) * factor);
  }

  return {step, snap, position, resize, stepSize, resizeFromPointer};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MapGrid;
