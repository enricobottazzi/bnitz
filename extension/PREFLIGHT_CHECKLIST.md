# BNITZ Chrome Web Store update checklist

## Prepare the release branch

- [x] Check that the version in `extension/manifest.json` is higher than the published Store version.
- [x] If the extension needs unreleased `lang/` changes, include those commits on the release branch before building. The ZIP bundles `lang/` from the same commit as the extension, so you can test both together before merging to `main`.
- [x] If the required Worker is still undeployed, test the branch against a [local Worker](README.md#build). If the deployed extension (the version published in the Chrome Web Store) cannot read maps from the new Worker, deploy the Worker from the release commit at a separate, stable HTTPS address before submitting. Keep the existing address working for people still using the older version. Save maps from each incompatible format under a different cache key or in a separate KV namespace.

## Build the Store ZIP

- [x] From the repository root on the release branch, run the tests and build from its committed `HEAD`. Set `worker_origin` below to the HTTPS origin this version will use after publication.
  ```bash
  (
    set -eo pipefail
    worker_origin=https://bnitz-routing-0-2-3.enricobottazzi.workers.dev
    out=$(mktemp -d)
    git archive HEAD extension assets lang bnitz.css RULES.md | tar -x -C "$out"
    version=$(node -p 'require(process.argv[1]).version' "$out/extension/manifest.json")
    npm --prefix "$out/extension" test
    BNITZ_WORKER_ORIGIN="$worker_origin" npm --prefix "$out/extension" run build
    (cd "$out/extension/dist" && zip -qr "$out/BNITZ-v$version.zip" \
      manifest.json bnitz.css reader icons lang/*.js \
      assets/{core,problem,background,method,implication,evidence,scope,favicon}.svg)
    printf '%s\n' "$out/BNITZ-v$version.zip"
  )
  ```

- [x] Open the ZIP. Confirm `manifest.json` is at its root, its host permissions cover the intended Worker, and `reader/config.mjs` points to that HTTPS origin. Check that the ZIP contains no development files or credentials.

## Test the exact ZIP

Unzip the package. In a Chrome test profile with one copy of BNITZ enabled, open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**. Select the extracted folder and confirm the version Chrome shows.

- [x] If the Worker changed, map a paper with the current Store extension in a separate profile and with the candidate ZIP. Check that each calls its intended deployed origin and renders the map.
- [ ] **Check first use.** Confirm the open tabs are the same before and after installation. On an arXiv HTML paper, click BNITZ and check that the disclosure appears in the side panel. Close and reopen the panel before agreeing. The disclosure should appear again, with no `paper-map` request in the panel’s Network tab. Click **Agree and start mapping** and confirm the current paper loads. Switch to a second arXiv HTML paper with the panel open and confirm it maps automatically.
- [ ] **Check saved consent.** Reopen the panel, or update a profile that agreed in an earlier version. The panel should map the current arXiv HTML paper immediately.
- [x] **Open an abstract and a PDF.** On the [Gemini 1.5 v1 abstract](https://arxiv.org/abs/2403.05530v1) and its [PDF](https://arxiv.org/pdf/2403.05530v1), confirm the panel shows **Open HTML version** without making a request. Follow the link and confirm the panel says “This arXiv page has no full HTML article.”
- [ ] **Switch tabs during loading.** Open a second HTML paper that needs a map. While it loads, switch to the first paper, then to an unrelated site, then back. The panel follows the active tab and never shows the other paper’s map or highlights. On the unrelated site, it shows the arXiv HTML guidance and disables export.
- [ ] **Select and export.** On a ready map, select two planets, one with Tab and Enter. Highlights and tracker marks follow the last selection. Export the `.bnitz` file and check its filename and `arxivId` match the active revision.
- [ ] **Check the cache.** Once a map is ready, reload the same paper revision. In the panel’s DevTools **Network** tab, confirm the new `paper-map` response includes `BNITZ-Cache: HIT` and the map loads again.
- [ ] **Check recovery.** In the panel’s DevTools, set **Network → Offline** and switch to a loaded HTML tab. The spinner stops with an error. Go back online and reload the paper. The map and export recover.

## Upload and submit

- [ ] Open the existing BNITZ item in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Under **Package**, choose **Upload new package**, select the tested ZIP, and confirm the draft version matches its manifest.
- [ ] Check **Store listing** for outdated descriptions, screenshots, and support links. Update any that no longer match the build.
- [ ] Check **Privacy**. Update the single purpose, permission justifications, data categories, and privacy policy URL where needed. If data handling changed, review the listing disclosure, side panel disclosure, and privacy policy together before confirming the data use declarations.
- [ ] Check **Distribution** for the intended audience and countries. An update stays on the existing channel unless you change it. Update **Test instructions** if reviewers need special steps or access.
- [ ] Check the public GitHub paths for [RULES.md](https://github.com/enricobottazzi/bnitz/blob/main/RULES.md), [ERRORS.md](https://github.com/enricobottazzi/bnitz/blob/main/extension/ERRORS.md), and [PRIVACY.md](https://github.com/enricobottazzi/bnitz/blob/main/extension/PRIVACY.md). Open them while signed out.
- [ ] Save the draft and click **Submit for review**. Turn off automatic publishing in the confirmation dialog if you want to publish manually after approval. [Chrome’s update guide](https://developer.chrome.com/docs/webstore/update)
- [ ] Archive the exact submitted ZIP in [packages/](packages/README.md) and record its SHA-256.

## After approval

- [ ] Publish if you chose manual publishing. Once the update reaches a test profile with the store version installed, confirm the new version and test highlighting and export on an arXiv HTML paper. If consent or permissions changed, check what an existing user sees on their first click after updating.
- [ ] After the release is published and merged into `main`, tag the release commit on `main` with the manifest version (`v0.2.4`).
- [ ] If this release moved to a new Worker, review requests to the previous Worker and any available extension-version usage data. Consider retiring it once older clients no longer depend on it.
