# BNITZ Chrome extension

Add `BNITZ_OPENROUTER: <key>` to `~/Desktop/TOKEN.md`. From `extension/`, using Node 22.13 or later, run:

```sh
npm ci --omit=optional
npm run build
```

In Chrome 151 or later, enable **Developer mode** at `chrome://extensions` and select `extension/dist` with **Load unpacked**.

The build embeds your key. Keep it local and see [Routing](ROUTING.md) before publishing.
