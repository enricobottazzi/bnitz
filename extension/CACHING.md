# Paper cache

BNITZ stores `map.bnitz` and `pdf-anchors.json` together in Chrome’s Cache Storage for the current profile. On a hit, BNITZ shows the map and highlights the matching arXiv PDF without calling OpenRouter. Missing or invalid entries trigger generation. Papers without a resolved version skip the cache.

The [cache key](reader/cache.mjs) combines the URL-encoded arXiv paper ID, its version, and a SHA-256 hash of the generation recipe. The recipe includes models, prompts, settings, schemas, rules, examples, and the PDF.js and anchor versions.

The [anchor format](reader/cache-entry.mjs) maps highlight ranges in the map’s exact text to PDF.js text items and page coordinates. Text offsets use UTF-16 with an exclusive end. **Export** downloads both files as a ZIP.
