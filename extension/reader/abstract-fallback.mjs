export async function locateWithGemini(fragments, {title, text}, requestGeneration) {
  const pdfLines = fragments.map(({id, page, x, y, size, text}) => `${id} [p${page} x${x} y${y} s${size}] ${text}`);
  return requestGeneration('extract', {title, arxivAbstract: text, pdfLines});
}
