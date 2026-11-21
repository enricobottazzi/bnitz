const BNITZPlayground = (() => {
  const {validRange, highlights} = typeof module === 'undefined' ? BNITZModel : require('../lang/model.js');

  function mergeRanges(ranges) {
    const merged = [];
    for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({...range});
    }
    return merged;
  }

  function toggleHighlight(text, planet, {start, end}) {
    if (!validRange(text, start, end)) return planet;
    const valid = range => validRange(text, range.start, range.end);
    let ranges = mergeRanges(highlights(planet).filter(valid));
    const index = ranges.findIndex(range => range.start <= start && end <= range.end);
    if (index === -1) {
      ranges = mergeRanges([...ranges, {start, end}]);
    } else {
      const original = ranges[index];
      ranges.splice(index, 1, ...[{...original, end: start}, {...original, start: end}].filter(valid));
    }
    const anchor = ranges[0] ?? planet;
    return {...planet, start: anchor.start, end: anchor.end, highlights: ranges};
  }

  function filename(title) {
    const words = title.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu);
    const stem = [...(words?.join('_') || 'abstract')].slice(0, 90).join('').replace(/_$/, '');
    return `${stem}.bnitz`;
  }

  return {toggleHighlight, filename};
})();

if (typeof module !== 'undefined') module.exports = BNITZPlayground;
