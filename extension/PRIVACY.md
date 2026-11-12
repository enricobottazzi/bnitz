# BNITZ Chrome extension privacy policy

Updated November 12, 2026.

BNITZ maps public arXiv PDFs and highlights related passages. No account is required.

For generation requests, BNITZ sends the paper title and text to its Cloudflare Worker, along with the arXiv ID and version when available. This can include the full paper text and PDF line positions. The Worker uses your IP address to rate-limit model requests. If the shared cache cannot serve the request, the Worker sends the paper data needed for that step to OpenRouter, which routes it to a provider for the requested Google Gemini model. Provider logging, retention, and training policies vary. [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/) · [OpenRouter privacy policy](https://openrouter.ai/privacy) · [Model provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)

Cloudflare stores generated results, which may contain paper excerpts, in a shared cache for up to 30 days. Chrome stores paper text, maps, and PDF highlight positions in the extension’s local cache. You can remove local results by clearing the extension’s storage.

BNITZ uses this data to generate and cache maps and highlights and to protect the service from abuse. BNITZ’s use of data follows the Chrome Web Store User Data Policy, including the Limited Use requirements. [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies/#protecting-user-privacy)

For privacy questions, use the [BNITZ issue tracker](https://github.com/enricobottazzi/bnitz/issues).
