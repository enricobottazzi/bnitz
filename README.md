# BNITZ

BNITZ is a visual language for mapping scientific papers. See the rules of the language in [RULES.md](RULES.md).

A v3 `.bnitz` file stores the paper's text, highlights, and map together. Highlights are `{start, end}` ranges in the text.

The **Reader** shows the map and text from a `.bnitz` file.

```sh
python3 reader/serve.py /path/to/paper.bnitz
```

Pass a folder instead to open a reading list.

The deployed Reader displays the maps in `examples/`. [Open the live Reader](https://bnitz.org/).

## Repository structure

- [`lang/`](lang/) defines the `.bnitz` language model and map layout in `model.js`. `view.js` renders the text, highlights, map, and legend.
- [`reader/`](reader/) contains the reading list, article view, inline Playground, and local server.
- [`examples/`](examples/) contains the published paper maps. [`archive/`](archive/) holds maps outside the reading list.
- [`assets/`](assets/), [`bnitz.css`](bnitz.css), and [`vendor/`](vendor/) provide the icons, base styles, and bundled KaTeX.

## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
