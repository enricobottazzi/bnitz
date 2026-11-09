# BNITZ

A visual language for mapping scientific arguments.

A `.bnitz` file stores the text, highlights, and map together.

The **Composer** lets you build a BNITZ map for a text.

```sh
open COMPOSER/index.html
```

The **Reader** shows the map and text from a `.bnitz` file.

```sh
python3 READER/serve.py /path/to/paper.bnitz
```

Pass a folder instead to open a reading list. The deployed Reader displays the maps in `examples/`. [Open the live Reader](https://bnitz.org/).

See the rules of the language in [RULES.md](RULES.md).

## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
