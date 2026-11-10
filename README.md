# BNITZ

Bnitz is a visual language for mapping scientific papers.

A `.bnitz` file stores the text, highlights, and map together.

Reader renders `$...$` and `$$...$$` math, simple `\emph{...}`, `\textit{...}` and `{\em ...}` emphasis, and TeX-style double quotes. Composer displays and saves the original LaTeX source.

The **Composer** lets you build a BNITZ map for a text. [Open the live Composer](https://bnitz.org/composer).

```sh
open COMPOSER/index.html
```

On the hosted Composer, paste an arXiv or IACR ePrint abstract or PDF link into **Source** and choose **Import abstract**. To test link imports locally, run `npx wrangler pages dev .` from the repo root and open `/COMPOSER/` on the local server.

The **Reader** shows the map and text from a `.bnitz` file.

```sh
python3 READER/serve.py /path/to/paper.bnitz
```

Pass a folder instead to open a reading list. The deployed Reader displays the maps in `examples/`. [Open the live Reader](https://bnitz.org/).

See the rules of the language in [RULES.md](RULES.md).

## License

BNITZ’s original code, documentation, artwork, and annotations are available under the [ISC license](LICENSE). The paper abstracts in `examples/` and other third-party material are subject to their respective rights and license terms.
