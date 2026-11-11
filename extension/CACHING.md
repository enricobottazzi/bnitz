# Caching BNITZ papers

Cache `map.bnitz` and `pdf-anchors.json`. Fetch the matching PDF from arXiv and use the two cached files to render the map, highlights, and scrollbar marks without calling Gemini.

The extension builds the map and anchors in memory today. This guide defines what to save and how to load it.

## Cache key

Key both files by **paper ID, paper version, and generator revision**.

```text
1706.03762/v7/<generatorRevision>/map.bnitz
1706.03762/v7/<generatorRevision>/pdf-anchors.json
```

Resolve unversioned arXiv links to the actual revision before lookup. Keep the paper ID and version separate. If using paths, encode the ID as one path segment so older arXiv IDs containing a slash work too.

Make `generatorRevision` a SHA-256 hash of a stable serialization of the generation recipe. Record the model IDs, prompt templates, generation settings, and response schemas for abstract and body extraction, map generation, and passage selection. Include the BNITZ rules and examples supplied to the models. Hash the recipe before inserting any paper text. A model or prompt change gets a new key for the same paper revision.

## What to store

**`map.bnitz`** is the complete version 2 document. Preserve the exact `text` value, including whitespace. All planet ranges and highlights use JavaScript string offsets (UTF-16 code units) with an inclusive start and exclusive end. A planet's single `highlights` list can point to both the abstract and the body. [Map assembly](reader/paper.mjs#L23)

```json
{
  "version": 2,
  "title": "Attention Is All You Need",
  "source": "https://arxiv.org/abs/1706.03762v7",
  "text": "The Transformer uses attention.\n\nThe encoder stacks self-attention layers.",
  "nucleus": "p1",
  "spans": [{
    "id": "p1",
    "start": 0,
    "end": 31,
    "highlights": [
      { "start": 16, "end": 30, "grade": "strong" },
      { "start": 45, "end": 73, "grade": "strong" }
    ]
  }]
}
```

**`pdf-anchors.json`** stores the PDF text items that intersect any planet's highlight. Keep every item a highlight crosses, including on later pages. One item can serve several highlights. Save the original text item and its zero-based index within the page's PDF.js text layer. `nodeOffset` is where the mapped portion starts inside that item, and `start` and `end` are offsets in `map.bnitz`'s `text`. PDF coordinates `x` and `y` let the viewer place the scrollbar marks at the current zoom. [PDF indexing and rendering](reader/pdf.mjs#L12)

The example below uses illustrative PDF item positions. Bump `anchorVersion` if the anchor format or PDF.js text item indexing changes.

```json
{
  "anchorVersion": 1,
  "pdfSpans": [
    {
      "pageNumber": 1, "index": 42, "text": "Abstract: The Transformer uses attention.",
      "nodeOffset": 10, "start": 0, "end": 31, "x": 72, "y": 650
    },
    {
      "pageNumber": 3, "index": 21, "text": "The encoder stacks self-attention layers.",
      "nodeOffset": 0, "start": 33, "end": 74, "x": 72, "y": 548
    }
  ]
}
```

## Read and write

- **Cache hit.** Load both files under the same key and render them with the versioned arXiv PDF.
- **Cache miss.** If either file is missing or the anchor version is unsupported, generate the map and anchors and save them as a pair under that key.

Chrome and R2 each store a single JSON object per key with `map.bnitz` and `pdf-anchors.json` as its fields. A write replaces both together. Chrome checks its local cache first and uses the shared cache when configured.

## Shared cache setup

From `extension/cache-worker`, run these commands once while signed in to Cloudflare. Generate a token with `openssl rand -hex 32` and use it for both the Worker secret and the extension build.

```sh
npx wrangler r2 bucket create bnitz-paper-cache
npx wrangler deploy
npx wrangler secret put BNITZ_CACHE_TOKEN
```

Add `BNITZ_CACHE_TOKEN` and `BNITZ_CACHE_URL` to `TOKEN.md`, using the origin printed by Wrangler for the URL. From `extension`, rebuild.

```sh
npm run build
```

Load `extension/dist` as the unpacked extension so Chrome grants access to the Worker. Keep the build private since it contains both tokens.
