# BNITZ

BNITZ is a visual notation for scientific arguments. Check out [bnitz.org](https://bnitz.org/).

## Repository structure

- [`lang/`](lang/) defines the `.bnitz` language model and map layout in `model.js`. `view.js` renders the text, highlights, map, and legend.
- [`reader/`](reader/) contains the reading list, article view, Playground, and local server.
- [`extension/`](extension/) contains the Chrome extension and its [privacy policy](extension/PRIVACY.md).
- [`eval/`](eval/) contains the local blind abstract-map evaluation interface.
- [`examples/`](examples/) contains the published paper maps. [`archive/`](archive/) holds maps outside the reading list.
- [`assets/`](assets/), [`bnitz.css`](bnitz.css), and [`vendor/`](vendor/) provide the icons, base styles, and bundled KaTeX.

## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
