# OpenRouter routing

The [local build](build.mjs) embeds the OpenRouter key in `dist/reader/local-key` and the extension calls OpenRouter directly. Anyone with the build can read the key. Revoke the key if you distributed the build.

## Before publishing

1. Route abstract extraction, map generation, and passage selection through a Cloudflare Worker. Keep prompts, models, and request and response limits on the server. Store a dedicated OpenRouter key as a [Worker secret](https://developers.cloudflare.com/workers/configuration/secrets/).
2. Rate-limit requests per IP, set an [OpenRouter spending limit](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key), and monitor usage.
3. Package the extension without the key and swap the OpenRouter host permission for the Worker’s origin. Check the ZIP, test cache hits and misses, and confirm the Worker rejects oversized or rate-limited requests. Disclose what paper text goes to the Worker and OpenRouter in the [store privacy policy](https://developer.chrome.com/docs/webstore/program-policies/policies).
