# BNITZ manual release checklist

Unzip the exact package you plan to upload. In `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the extracted folder. Use a test profile with one copy of BNITZ enabled.

- [ ] **Check the build.** Chrome shows the intended version, higher than the published version. `reader/config.mjs` points to the production Worker, and the ZIP contains no development files or credentials.
- [ ] **Open a PDF.** Click BNITZ on an [arXiv PDF](https://arxiv.org/pdf/2501.12948v2). **Open the HTML version of this paper** opens the same revision in a new tab. On HTML, the link gives way to the loading state or map. Click back to the PDF tab and check that the link returns.
- [ ] **Switch tabs during loading.** Open a second HTML paper that needs a map. While it loads, switch to the first paper, then to an unrelated site, then back. The panel follows the active tab and never shows the other paper’s map or highlights. On the unrelated site, it shows the arXiv HTML guidance and disables export.
- [ ] **Select and export.** On a ready map, select two planets, one with Tab and Enter. Highlights and tracker marks follow the last selection. Export the `.bnitz` file and check its filename and `arxivId` match the active revision.
- [ ] **Check the cache.** Once a map is ready, reload the same paper revision. In the panel’s DevTools **Network** tab, confirm the new `paper-map` response includes `BNITZ-Cache: HIT` and the map loads again.
- [ ] **Check recovery.** In the panel’s DevTools, set **Network → Offline** and switch to a loaded HTML tab. The spinner stops with an error. Go back online and reload the paper. The map and export recover.
- [ ] **Check documentation paths.** Verify the links point to [RULES.md](../RULES.md), [extension/ERRORS.md](ERRORS.md), and [extension/PRIVACY.md](PRIVACY.md) in the repository.
