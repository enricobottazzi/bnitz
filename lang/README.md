# BNITZ language

BNITZ is a visual language for mapping scientific papers. See the rules of the language in [RULES.md](../RULES.md).

## `.bnitz` formats

Both formats use zero-based UTF-16 offsets with an exclusive `end`. A planet’s own `start` and `end` anchor it in the abstract. The `core` field stores the ID of the Core.

### v3 · General purpose

A v3 file stores the title, abstract as `text`, and planet map. Each `{start, end}` highlight refers to `text`.

```json
{
  "version": 3,
  "title": "Example paper",
  "text": "The Transformer uses attention.",
  "core": "p1",
  "spans": [
    {
      "id": "p1",
      "start": 4,
      "end": 30,
      "highlights": [{"start": 4, "end": 30}]
    }
  ]
}
```

### v3arxiv · arXiv

The extension’s v3arxiv format stores a versioned `arxivId` and the planet map. The extension reads the title, authors, and text from that arXiv HTML revision. Each highlight’s `section` tells the extension whether its offsets refer to the extracted `abstract` or `body`. Body offsets count the two newlines between blocks. The offsets below are illustrative.

```json
{
  "version": "3arxiv",
  "arxivId": "1706.03762v7",
  "core": "p1",
  "spans": [
    {
      "id": "p1",
      "start": 244,
      "end": 329,
      "highlights": [
        {"section": "abstract", "start": 244, "end": 329},
        {"section": "body", "start": 1200, "end": 1260}
      ]
    }
  ]
}
```
