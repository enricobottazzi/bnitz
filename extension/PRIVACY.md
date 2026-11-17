# BNITZ Chrome extension privacy policy

Updated November 17, 2026.

BNITZ maps and highlights papers on public arXiv HTML pages. BNITZ works without an account.

BNITZ opens a setup tab after installation. If you already use BNITZ, the tab opens the first time you click its toolbar icon after updating to the version that introduces consent. BNITZ waits for you to click **Agree and continue** before extracting or sending paper content. It remembers your choice locally in your Chrome profile. Once you agree, BNITZ can request a map automatically for the arXiv HTML paper you’re viewing while the side panel is open.

When the side panel requests a map, Chrome sends the title, authors, affiliations, revision date, versioned arXiv ID, abstract, and extracted body blocks from the public arXiv page to its Cloudflare Worker. The Worker uses the request IP address to rate-limit model calls. [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)

When a completed map is missing from the cache, the Worker sends the title, authors, affiliations, revision date, and abstract to OpenRouter to map the abstract. A second request includes the title, planets with their abstract highlights, and body blocks to select body highlights. OpenRouter routes both requests to a provider for the configured Google Gemini model. A correction request for an invalid abstract map also includes the previous reply and validation error. Provider logging, retention, and training practices vary. [OpenRouter privacy policy](https://openrouter.ai/privacy) · [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)

Cloudflare caches one completed `.bnitz` map per arXiv revision for up to 30 days. The map contains the versioned arXiv ID, planet IDs, relationships, and highlight offsets. A fingerprint of the extracted abstract and body in the cache metadata checks that the offsets match the current text. Chrome applies the highlights on your device. **Export paper map** saves the same map as a `.bnitz` download.

BNITZ uses this data to generate, cache, and display paper maps and highlights and to protect the generation service from abuse. [Chrome Web Store privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy)

For privacy questions, use the [BNITZ issue tracker](https://github.com/enricobottazzi/bnitz/issues).
