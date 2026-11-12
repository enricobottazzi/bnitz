# Paper cache

BNITZ first checks Chrome’s Cache Storage for `map.bnitz` and `pdf-anchors.json`. A local hit displays the saved map and uses the saved anchors when a planet is selected. The local key includes the arXiv paper ID, paper version, and a digest of the generation recipe, PDF.js version, and anchor format.

On a local miss, Chrome parses the PDF and sends generation requests to the Worker. The Worker checks Workers KV for its own extraction, map, and passage-selection results. The [shared key](worker/cache.mjs) uses the versioned arXiv ID, generation recipe, operation, and SHA-256 digest of that operation’s input. A hit skips OpenRouter. Chrome verifies the selected text against the PDF and builds its local anchors.

The Worker writes results on demand and expires them after 30 days. KV can take about a minute to make a new entry visible in other regions. Papers without a resolved version bypass both caches. [Cloudflare Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

The [anchor format](reader/cache-entry.mjs) maps highlight ranges in the map’s exact text to PDF.js text items and page coordinates. Text offsets use UTF-16 with an exclusive end. **Export** downloads both files as a ZIP.
