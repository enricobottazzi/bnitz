# BNITZ

Bnitz is a visual language for mapping scientific papers. See the rules of the language in [RULES.md](RULES.md).

A `.bnitz` file stores the text, highlights, and map together.

Reader renders `$...$` and `$$...$$` math, simple `\emph{...}`, `\textit{...}` and `{\em ...}` emphasis, and TeX-style double quotes.

The **Reader** shows the map and text from a `.bnitz` file.

```sh
python3 READER/serve.py /path/to/paper.bnitz
```

Pass a folder instead to open a reading list. The deployed Reader displays the maps in `examples/`. [Open the live Reader](https://bnitz.org/).


## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
