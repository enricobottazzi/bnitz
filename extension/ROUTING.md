# Generation routing

The extension sends paper data to the [Cloudflare Worker](worker/index.mjs) for abstract extraction, map generation, and passage selection. The Worker owns the prompts, models, request sizes, and output token limits. Chrome still parses the PDF, anchors the highlights, and checks its local cache before requesting generation.

## Limits

- [Wrangler](wrangler.toml) allows approximately 12 model calls per IP per minute at each Cloudflare location. A map retry counts as another call. The Worker returns HTTP 429 when the limiter denies a call. [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- Set the BNITZ key’s credit limit in the OpenRouter dashboard. OpenRouter enforces the key’s budget across Cloudflare locations. [OpenRouter key settings](https://openrouter.ai/settings/keys)

## Deploy

1. From `extension/`, run `npx wrangler deploy` to update the Worker. To rotate the capped OpenRouter key, run `npx wrangler secret put OPENROUTER_API_KEY` and enter the new key when prompted. [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
2. Run `npm run build` to build against the deployed Worker at `https://bnitz-routing.enricobottazzi.workers.dev`. Set `BNITZ_WORKER_ORIGIN` to build against another Worker. Package the contents of `extension/dist` for Chrome.
3. Test a fresh arXiv paper and reopen it to check the local cache. Check that the release ZIP contains no key and that its generation host permission points to the Worker. Describe the paper text sent to Cloudflare and OpenRouter and the results stored in Workers KV in the store privacy policy. [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
