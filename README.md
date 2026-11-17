# BNITZ

BNITZ is a visual language for mapping scientific papers. See the rules of the language in [RULES.md](RULES.md).

## `.bnitz` formats

Both formats use zero-based UTF-16 offsets with an exclusive `end`. A planet’s own `start` and `end` anchor it in the abstract.

### v3 · General purpose

A v3 file stores the title, abstract as `text`, and planet map. Each `{start, end}` highlight refers to `text`.

```json
{
  "version": 3,
  "title": "Example paper",
  "text": "The Transformer uses attention.",
  "nucleus": "p1",
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
  "nucleus": "p1",
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

## Reader

The **Reader** shows the map and text from a v3 `.bnitz` file.

```sh
python3 reader/serve.py /path/to/paper.bnitz
```

Pass a folder instead to open a reading list.

The deployed Reader displays the maps in `examples/`. [Open the live Reader](https://bnitz.org/).

The orbit icon opens a random example in the **Playground**. Import a v3 `.bnitz` file, edit its text and details, adjust planets and highlights, then export it. The `playground` link on a reading opens an editable copy. The Playground is available on desktop and mobile. Text edits move the passage offsets with the text; if a passage is deleted entirely, select a new highlight or remove its planet before exporting. Changes stay in the current page until exported.

## Repository structure

- [`lang/`](lang/) defines the `.bnitz` language model and map layout in `model.js`. `view.js` renders the text, highlights, map, and legend.
- [`reader/`](reader/) contains the reading list, article view, Playground, and local server.
- [`extension/`](extension/) contains the Chrome extension and its [privacy policy](extension/PRIVACY.md).
- [`examples/`](examples/) contains the published paper maps. [`archive/`](archive/) holds maps outside the reading list.
- [`assets/`](assets/), [`bnitz.css`](bnitz.css), and [`vendor/`](vendor/) provide the icons, base styles, and bundled KaTeX.

## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
