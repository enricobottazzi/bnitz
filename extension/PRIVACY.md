# BNITZ Chrome extension privacy policy

Updated November 16, 2026.

BNITZ maps and highlights abstracts on public arXiv HTML pages. BNITZ works without an account.

When the side panel requests a map, Chrome extracts the paper's metadata, abstract, and body from the open arXiv HTML page. The body stays in memory on your device. BNITZ sends the title, authors, affiliations, revision date, abstract, and versioned arXiv ID to its Cloudflare Worker. The Worker uses the request IP address to rate-limit model calls. [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)

When a map is missing from the cache, the Worker sends the title, authors, affiliations, revision date, and abstract to OpenRouter, which routes the request to a provider for the configured Google Gemini model. If the Worker asks the model to correct an invalid map, it also sends the previous reply and validation error. Provider logging, retention, and training practices vary. [OpenRouter privacy policy](https://openrouter.ai/privacy) · [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging)

Cloudflare caches validated maps for up to 30 days. Each entry stores planet IDs, relationships, and highlight offsets under a key that includes the versioned arXiv ID and a hash of the map inputs. The Worker returns the map with the title, abstract, and versioned arXiv HTML link. Chrome applies the highlights on your device. When you choose **Export abstract map**, Chrome saves the result as a `.bnitz` download.

BNITZ uses this data to generate, cache, and display abstract maps and highlights and to protect the generation service from abuse. [Chrome Web Store privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy)

For privacy questions, use the [BNITZ issue tracker](https://github.com/enricobottazzi/bnitz/issues).
