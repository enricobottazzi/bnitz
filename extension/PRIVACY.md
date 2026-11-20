# BNITZ Chrome extension privacy policy

Updated November 20, 2026.

BNITZ maps and highlights papers on public arXiv HTML pages. BNITZ works without an account.

When you open the BNITZ side panel for the first time, it explains what paper content it sends and who receives it, unless you have already agreed in an earlier version. Click **Agree and start mapping** to allow BNITZ to extract and send paper content. BNITZ remembers your agreement in your Chrome profile. Once you agree, it automatically requests a map for each public arXiv HTML paper you view while the side panel is open.

When the side panel requests a map, Chrome sends the title, authors, affiliations, revision date, versioned arXiv ID, abstract, and extracted body blocks from the public arXiv page to its Cloudflare Worker. The Worker uses the request IP address to rate-limit model calls. [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)

When the Worker needs to generate a map and decision note, it sends the title, authors, affiliations, revision date, and abstract to OpenRouter to map the abstract. A second request includes the title, planets with their abstract highlights, and body blocks to select body highlights. OpenRouter routes both requests to a provider for the configured Google Gemini model. A correction request for an invalid abstract map also includes the previous reply and validation error. Provider logging, retention, and training practices vary. [OpenRouter privacy policy](https://openrouter.ai/privacy) · [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)

Cloudflare caches the completed map and the model’s one-sentence decision note per arXiv revision for up to 30 days. The map contains the versioned arXiv ID, planet IDs, relationships, and highlight offsets. A fingerprint of the extracted abstract and body in the cache metadata checks that the offsets match the current text. Chrome applies the highlights on your device and displays the note in the side-panel developer console. **Export paper map** saves the map as a `.bnitz` download.

BNITZ uses this data to generate, cache, and display paper maps and highlights and to protect the generation service from abuse. [Chrome Web Store privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy)

For privacy questions, use the [BNITZ issue tracker](https://github.com/enricobottazzi/bnitz/issues).
