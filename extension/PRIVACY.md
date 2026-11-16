# BNITZ Chrome extension privacy policy

Updated November 16, 2026.

BNITZ maps and highlights abstracts on public arXiv HTML pages. BNITZ works without an account.

When you request a map, Chrome extracts the abstract and body from the HTML into a temporary JSON document in memory. The body stays on your device. BNITZ sends the title, authors, affiliations, revision date, abstract, and versioned arXiv ID to its Cloudflare Worker. The Worker uses the request IP address to rate-limit model calls. On a cache miss, it sends the title, authors, affiliations, revision date, and abstract to OpenRouter, which routes the request to a provider for the configured Google Gemini model. Provider logging, retention, and training policies vary. [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/) · [OpenRouter privacy policy](https://openrouter.ai/privacy) · [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)

Cloudflare caches validated maps as planet relations and character ranges for up to 30 days. The Worker returns a `.bnitz` document with the title, abstract, versioned arXiv HTML link, map, and highlight offsets. Chrome uses it to apply highlights on your device. If you export it, Chrome saves the `.bnitz` file as a download.

BNITZ uses this data to generate, cache, and display abstract maps and highlights and to protect the generation service from abuse. [Chrome Web Store privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy)

For privacy questions, use the [BNITZ issue tracker](https://github.com/enricobottazzi/bnitz/issues).
