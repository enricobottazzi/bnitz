# OpenRouter routing

## Exposure check

The [build](build.mjs) copies `BNITZ_OPENROUTER` from `~/Desktop/TOKEN.md` into `extension/dist/reader/local-key` in plaintext. The [extension](reader/openrouter.mjs) reads it and calls OpenRouter directly. Anyone who gets this build can extract the key. A build with the shared cache enabled also contains `BNITZ_CACHE_TOKEN`, which allows cache writes.

`extension/dist` is Git-ignored. I found no OpenRouter key in the checked Git history, including the public GitHub branch and tags, and no published GitHub release packages. The live site could not be verified. Revoke any key or cache token from a build that was uploaded or shared.

## Before publishing

1. Route model calls through the [Cloudflare Worker](cache-worker/worker.mjs). Store a dedicated OpenRouter key as a [Worker secret](https://developers.cloudflare.com/workers/configuration/secrets/). Give the Worker fixed operations for abstract extraction, map generation, and passage selection. Keep prompts, model choices, and input and output limits server-side. Return structured results and keep PDF rendering and highlighting in Chrome.
2. For a no-login launch, rate-limit requests per IP, set a low [OpenRouter spend limit](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key), and monitor usage. Use Chrome’s local cache for launch and reserve any shared-cache writes for the server.
3. Build the store ZIP without either credential and replace the OpenRouter host permission with the Worker’s origin. Inspect the ZIP, test a cache hit and a cache miss, and verify that oversized and rate-limited requests are rejected before reaching OpenRouter. Disclose what paper text goes to the Worker and OpenRouter in the [Chrome Web Store privacy policy](https://developer.chrome.com/docs/webstore/program-policies/policies).
