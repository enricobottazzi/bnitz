# BNITZ Chrome Web Store update checklist

## Build the ZIP

- [ ] Compare `extension/manifest.json` with the version in the store. The candidate must have a higher version, and the Git tag must match the manifest (`v0.2.0` for `0.2.0`).
- [ ] Build from the tag and run the Worker tests. From the repository root, set `tag` to the version you’re submitting and stop if a command fails.

  ```sh
  tag=v0.2.0
  out=$(mktemp -d)
  git archive "$tag" extension assets lang bnitz.css RULES.md | tar -x -C "$out"
  npm --prefix "$out/extension" test
  npm --prefix "$out/extension" run build
  (cd "$out/extension/dist" && zip -qr "$out/BNITZ-$tag.zip" .)
  printf '%s\n' "$out/BNITZ-$tag.zip"
  ```

- [ ] Open the ZIP. `manifest.json` is at its root, `reader/config.mjs` points to the production Worker, and the ZIP contains no development files or credentials. If the update depends on Worker changes, check that production supports both the current store version and the candidate.

## Test the exact ZIP

Unzip the package. In a Chrome test profile with one copy of BNITZ enabled, open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**. Select the extracted folder and confirm the version Chrome shows.

- [ ] **Check first use.** Confirm the open tabs are the same before and after installation. On an arXiv HTML paper, click BNITZ and check that the disclosure appears in the side panel. Close and reopen the panel before agreeing. The disclosure should appear again, with no `paper-map` request in the panel’s Network tab. Click **Agree and start mapping** and confirm the current paper loads. Switch to a second arXiv HTML paper with the panel open and confirm it maps automatically.
- [ ] **Check saved consent.** Reopen the panel, or update a profile that agreed in an earlier version. The panel should map the current arXiv HTML paper immediately.
- [ ] **Open a PDF.** Click BNITZ on an [arXiv PDF](https://arxiv.org/pdf/2501.12948v2). **Open the HTML version of this paper** opens the same revision in a new tab. On HTML, the link gives way to the loading state or map. Click back to the PDF tab and check that the link returns.
- [ ] **Switch tabs during loading.** Open a second HTML paper that needs a map. While it loads, switch to the first paper, then to an unrelated site, then back. The panel follows the active tab and never shows the other paper’s map or highlights. On the unrelated site, it shows the arXiv HTML guidance and disables export.
- [ ] **Select and export.** On a ready map, select two planets, one with Tab and Enter. Highlights and tracker marks follow the last selection. Export the `.bnitz` file and check its filename and `arxivId` match the active revision.
- [ ] **Check the cache.** Once a map is ready, reload the same paper revision. In the panel’s DevTools **Network** tab, confirm the new `paper-map` response includes `BNITZ-Cache: HIT` and the map loads again.
- [ ] **Check recovery.** In the panel’s DevTools, set **Network → Offline** and switch to a loaded HTML tab. The spinner stops with an error. Go back online and reload the paper. The map and export recover.

## Upload and submit

- [ ] Open the existing BNITZ item in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Under **Package**, choose **Upload new package**, select the tested ZIP, and confirm the draft version matches the tag.
- [ ] Check **Store listing** for outdated descriptions, screenshots, and support links. Update any that no longer match the build.
- [ ] Check **Privacy**. Update the single purpose, permission justifications, data categories, and privacy policy URL where needed. If data handling changed, review the listing disclosure, side panel disclosure, and privacy policy together before confirming the data use declarations.
- [ ] Check **Distribution** for the intended audience and countries. An update stays on the existing channel unless you change it. Update **Test instructions** if reviewers need special steps or access.
- [ ] Check the public GitHub paths for [RULES.md](https://github.com/enricobottazzi/bnitz/blob/main/RULES.md), [ERRORS.md](https://github.com/enricobottazzi/bnitz/blob/main/extension/ERRORS.md), and [PRIVACY.md](https://github.com/enricobottazzi/bnitz/blob/main/extension/PRIVACY.md). Open them while signed out.
- [ ] Save the draft and click **Submit for review**. Turn off automatic publishing in the confirmation dialog if you want to publish manually after approval. [Chrome’s update guide](https://developer.chrome.com/docs/webstore/update)

## After approval

- [ ] Publish if you chose manual publishing. Once the update reaches a test profile with the store version installed, confirm the new version and run the PDF-to-HTML flow through highlighting and export. If consent or permissions changed, check what an existing user sees on their first click after updating.
