# BNITZ Chrome extension

Build from this directory with Node 22.13 or later.

```sh
npm ci --omit=optional
npm run build
```

The build reads `BNITZ_OPENROUTER` from `~/Desktop/TOKEN.md`. To use a different location, run `npm run build -- /path/to/TOKEN.md`. The generated `dist` contains the key in a private, Git-ignored file. Keep the unpacked build local.

In Chrome 151 or later, load the `extension` folder with **Load unpacked** at `chrome://extensions`, or reload the existing BNITZ installation. Open [Attention Is All You Need](https://arxiv.org/pdf/1706.03762) and click the BNITZ toolbar icon. After the map loads, select a planet to highlight its passage on the PDF page.

Chrome keeps the arXiv address and displays the paper through PDF.js in the original tab. BNITZ looks for a unique match to the arXiv abstract in the first three PDF pages. When it cannot find one, it sends the extracted text from those pages and the arXiv abstract to Gemini 4 Argon via OpenRouter to locate the printed abstract. Gemini 2.5 Flash then builds the map from the selected PDF text, the BNITZ rules, and two examples. Chrome handles PDFs from other sites with its native viewer.

For the Attention Is All You Need pilot (latest or v7), the fallback sends text from the whole PDF to Argon to locate both the abstract and the body. Argon then generates the map in one request and selects up to three body quotes per planet in another. Selecting a planet highlights all of its passages in the PDF. Marks beside the scrollbar show where the passages are as you scroll.

The extension caches the map and PDF anchors in Chrome. Reopening the same paper revision uses both without calling Gemini. See [Caching](CACHING.md) to share the cache across installations.
